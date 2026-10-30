import { resolve } from "node:path";
import type { Config } from "#config/schema";
import { getAdapter } from "#formats";
import { defaultCodec, type ImageCodec } from "#image/codec";
import { composePage } from "#image/compose";
import { cropFrames } from "#image/trim";
import { packUnits, sortBySize, type PackedItem, type PackUnit } from "#pack/maxrects";
import { PACKER_VERSION } from "./version";
import { platform } from "#platform";
import { discoverFiles } from "./discover";
import { ConfigError, PackError } from "./errors";
import { buildGroups, pathVars } from "./group";
import type { Logger } from "./logger";
import type {
  AtlasAnimationInfo,
  AtlasFrameEntry,
  AtlasResult,
  Frame,
  ManifestFile,
  PlacedFrame,
} from "./types";
import {
  fileExists,
  fileSize,
  isDirectory,
  readBytes,
  readJson,
  removeFile,
  writeFileAtomic,
} from "#utils/fs";
import { resolveFrom } from "#utils/paths";
import { sha256, sha256File, stableStringify } from "#utils/hash";
import { formatTemplate } from "#utils/name";
import { mapLimit } from "#utils/pool";

export interface PipelineOptions {
  rootDir: string;
  baseDir: string;
  config: Config;
  configPath: string | null;
  logger: Logger;
  /** Pixel backend, `sharp` by default. */
  codec?: ImageCodec;
}

export interface RunFlags {
  dryRun?: boolean;
  check?: boolean;
  clean?: boolean;
}

export interface PageReport {
  file: string;
  width: number;
  height: number;
  bytes: number;
  frames: number;
}

export interface PackReport {
  rootDir: string;
  outDir: string;
  configPath: string | null;
  sprites: number;
  animations: number;
  frames: number;
  pages: PageReport[];
  manifests: string[];
  sourceBytes: number;
  atlasBytes: number;
  hash: string;
  durationMs: number;
  warnings: string[];
  dryRun: boolean;
  written: string[];
  check?: { ok: boolean; differences: string[] };
}

interface UnitWithStats extends PackUnit {
  name: string;
  width: number;
  height: number;
}

export async function runPipeline(
  options: PipelineOptions,
  flags: RunFlags = {},
): Promise<PackReport> {
  const started = platform.now();
  const { config, baseDir, rootDir, logger, codec = defaultCodec } = options;
  const outDir = resolveFrom(baseDir, config.output.dir);
  const warnings: string[] = [];

  if (!(await isDirectory(rootDir))) {
    throw new ConfigError(
      `Input directory not found: ${rootDir}`,
      "Pass an existing folder: jtp pack ./assets",
    );
  }

  logger.info(`input  ${rootDir}`);
  logger.debug(`codec  ${codec.id}`);
  logger.info(`output ${outDir}`);
  if (config.crop.mode === "none") warnings.push("crop.mode = none: transparent borders are kept");

  // 1. discover -------------------------------------------------------------
  const rels = await discoverFiles({
    rootDir,
    include: config.include,
    exclude: config.exclude,
    outputDir: outDir,
    outputName: config.output.name,
  });
  if (rels.length === 0) {
    throw new ConfigError(
      `No images found in ${rootDir}`,
      `Include patterns: ${config.include.join(", ")}`,
    );
  }

  // 2. hash inputs (for determinism / --check) ------------------------------
  let sourceBytes = 0;
  const hashParts: string[] = [];
  for (const rel of rels) {
    const abs = resolve(rootDir, rel);
    sourceBytes += await fileSize(abs);
    hashParts.push(`${rel}:${await sha256File(abs)}`);
  }
  const hash = sha256(PACKER_VERSION, stableStringify(config), ...hashParts.sort());

  // 3. decode ---------------------------------------------------------------
  let decoded = 0;
  const sources = await mapLimit(rels, config.concurrency, async (rel) => {
    const source = await codec.decode(resolve(rootDir, rel), rel);
    decoded++;
    logger.progress(decoded, rels.length, "decoding");
    return source;
  });

  // 4. group + crop + name --------------------------------------------------
  const groups = buildGroups(sources, config);
  const frames: Frame[] = [];
  const animations: AtlasAnimationInfo[] = [];
  const units: UnitWithStats[] = [];

  for (const group of groups) {
    const cropped = cropFrames(group.frames, config.crop, group.kind === "animation");
    const vars = pathVars(group.source);

    if (group.kind === "sprite") {
      const croppedFrame = cropped[0];
      if (!croppedFrame) continue;
      const frame: Frame = {
        ...croppedFrame,
        name: group.name,
        index: 0,
        animation: null,
        duration: 0,
        source: group.source,
      };
      frames.push(frame);
      units.push({
        id: `sprite:${frame.name}`,
        name: frame.name,
        width: frame.width,
        height: frame.height,
        items: [{ id: frame.name, w: frame.width, h: frame.height }],
      });
      continue;
    }

    const list: Frame[] = cropped.map((croppedFrame, index) => ({
      ...croppedFrame,
      name: formatTemplate(config.naming.frameTemplate, {
        ...vars,
        name: group.name,
        index,
      }),
      index,
      animation: group.name,
      duration: group.durations[index] ?? config.animations.defaultFrameDuration,
      source: group.source,
    }));

    frames.push(...list);

    const duration = list.reduce((sum, frame) => sum + frame.duration, 0);
    animations.push({
      name: group.name,
      frames: list.map((frame) => frame.name),
      duration,
      fps: duration > 0 ? Math.round((list.length / duration) * 1000 * 100) / 100 : 0,
    });

    const largest = list.reduce(
      (best, frame) => (frame.width * frame.height > best.width * best.height ? frame : best),
      list[0] as Frame,
    );
    units.push({
      id: `animation:${group.name}`,
      name: group.name,
      width: largest.width,
      height: largest.height,
      items: sortBySize(list, config.atlas.sort).map((frame) => ({
        id: frame.name,
        w: frame.width,
        h: frame.height,
      })),
    });
  }

  assertUniqueNames(frames);

  if (frames.length === 0) {
    throw new ConfigError(`No frames produced from ${rels.length} file(s)`);
  }

  // 5. pack -----------------------------------------------------------------
  const sortedUnits = sortBySize(units, config.atlas.sort);
  const packed = packUnits(sortedUnits, {
    maxWidth: config.atlas.maxWidth,
    maxHeight: config.atlas.maxHeight,
    padding: config.atlas.padding,
    extrude: config.atlas.extrude,
    allowRotation: config.atlas.allowRotation,
    maxPages: config.atlas.maxPages,
  });

  const placementByName = new Map<string, PackedItem>(packed.items.map((item) => [item.id, item]));

  const pages = packed.pages.map((page, index) => ({
    index,
    width: config.atlas.powerOfTwo
      ? Math.min(nextPowerOfTwo(page.w), config.atlas.maxWidth)
      : page.w,
    height: config.atlas.powerOfTwo
      ? Math.min(nextPowerOfTwo(page.h), config.atlas.maxHeight)
      : page.h,
    file: formatTemplate(config.atlas.pageNaming, {
      name: config.output.name,
      page: index === 0 ? "" : `-${index + 1}`,
    }),
  }));

  // 6. compose + encode -----------------------------------------------------
  const pageFrames = new Map<number, PlacedFrame[]>();
  for (const frame of frames) {
    const placed = placementByName.get(frame.name);
    if (!placed) throw new PackError(`Internal error: frame ${frame.name} was not placed`);
    const list = pageFrames.get(placed.page) ?? [];
    list.push({
      frame,
      page: placed.page,
      rect: { x: placed.x, y: placed.y, w: placed.w, h: placed.h },
      rotated: placed.rotated,
    });
    pageFrames.set(placed.page, list);
  }

  let encoded = 0;
  const pageBuffers = await mapLimit(
    pages,
    clampConcurrency(config.concurrency),
    async (page, index) => {
      const data = composePage(
        page.width,
        page.height,
        pageFrames.get(index) ?? [],
        config.atlas.extrude,
      );
      const buffer = await codec.encodePng(data, page.width, page.height, config.encode.png);
      encoded++;
      logger.progress(encoded, pages.length, "encoding");
      return buffer;
    },
  );

  const pageReports: PageReport[] = pages.map((page, index) => ({
    file: page.file,
    width: page.width,
    height: page.height,
    bytes: pageBuffers[index]?.byteLength ?? 0,
    frames: pageFrames.get(index)?.length ?? 0,
  }));

  // 7. manifests ------------------------------------------------------------
  const baseResult: Omit<AtlasResult, "generated"> = {
    pages: pages.map(({ index, file, width, height }) => ({ index, file, width, height })),
    frames: buildFrameEntries(frames, placementByName),
    animations: [...animations].sort((a, b) => (a.name < b.name ? -1 : 1)),
    scale: 1,
    hash,
  };

  const context = { baseName: config.output.name, outputDir: outDir };
  const manifestSpecs = config.manifests.map((spec) => {
    const adapter = getAdapter(spec.format);
    const parsed = adapter.optionsSchema.safeParse(spec);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      );
      throw new ConfigError(`Invalid options for manifest "${spec.format}": ${issues.join("; ")}`);
    }
    const options = parsed.data as Record<string, unknown>;
    // Manifest file names follow `output.name` unless the config sets one.
    if ((spec as { file?: unknown }).file === undefined) {
      options.file = `${config.output.name}${adapter.extension}`;
    }
    return { adapter, options: parsed.data };
  });

  const pageFiles = pages.map((page) => page.file);
  const draftFiles = manifestSpecs.flatMap(({ adapter, options }) =>
    adapter.build({ ...baseResult, generated: [] } as AtlasResult, options, context),
  );
  const generated = [...pageFiles, ...draftFiles.map((file) => file.file)];

  const manifestFiles: ManifestFile[] = manifestSpecs.flatMap(({ adapter, options }) =>
    adapter.build({ ...baseResult, generated }, options, context),
  );

  const outputs: ManifestFile[] = [
    ...pages.map((page, index) => ({
      file: page.file,
      contents: pageBuffers[index] as Uint8Array,
    })),
    ...manifestFiles,
  ];

  // 8. write / compare ------------------------------------------------------
  const written: string[] = [];
  let check: PackReport["check"];

  if (flags.dryRun) {
    logger.info("dry run: nothing written");
  } else if (flags.check) {
    const differences: string[] = [];
    for (const output of outputs) {
      const abs = resolve(outDir, output.file);
      if (!(await fileExists(abs))) {
        differences.push(`${output.file}: missing`);
        continue;
      }
      const existing = await readBytes(abs);
      const expected = toBytes(output.contents);
      if (!equalBytes(existing, expected)) differences.push(`${output.file}: differs`);
    }
    check = { ok: differences.length === 0, differences };
  } else {
    if (flags.clean) await cleanStale(outDir, manifestFiles[0]?.file, generated, warnings);

    for (const output of outputs) {
      await writeFileAtomic(resolve(outDir, output.file), output.contents);
      written.push(output.file);
    }
  }

  const durationMs = Math.round(platform.now() - started);
  const atlasBytes = pageBuffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);

  return {
    rootDir,
    outDir,
    configPath: options.configPath,
    sprites: frames.filter((frame) => frame.animation === null).length,
    animations: animations.length,
    frames: frames.length,
    pages: pageReports,
    manifests: manifestFiles.map((file) => file.file),
    sourceBytes,
    atlasBytes,
    hash,
    durationMs,
    warnings,
    dryRun: Boolean(flags.dryRun),
    written,
    check,
  };
}

function buildFrameEntries(
  frames: Frame[],
  placementByName: Map<string, PackedItem>,
): AtlasFrameEntry[] {
  return frames
    .map((frame) => {
      const placed = placementByName.get(frame.name);
      if (!placed) throw new PackError(`Internal error: frame ${frame.name} was not placed`);
      return {
        name: frame.name,
        page: placed.page,
        // TexturePacker/Pixi convention: w/h are the unrotated sprite size,
        // `rotated: true` means the atlas region is stored rotated 90° CW.
        frame: { x: placed.x, y: placed.y, w: frame.width, h: frame.height },
        rotated: placed.rotated,
        trimmed: frame.trimmed,
        sourceSize: { w: frame.sourceWidth, h: frame.sourceHeight },
        sourceOffset: { x: frame.offsetX, y: frame.offsetY },
      } satisfies AtlasFrameEntry;
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function assertUniqueNames(frames: Frame[]): void {
  const seen = new Map<string, string>();
  for (const frame of frames) {
    const previous = seen.get(frame.name);
    if (previous !== undefined) {
      throw new ConfigError(
        `Duplicate frame name "${frame.name}" (${previous} and ${frame.source})`,
        "Adjust naming.template / naming.frameTemplate (animation frames must include {index}).",
      );
    }
    seen.set(frame.name, frame.source);
  }
}

async function cleanStale(
  outDir: string,
  manifestFile: string | undefined,
  generated: string[],
  warnings: string[],
): Promise<void> {
  if (!manifestFile) return;
  const manifestPath = resolve(outDir, manifestFile);
  if (!(await fileExists(manifestPath))) return;

  try {
    const manifest = await readJson<{ meta?: { generated?: unknown } }>(manifestPath);
    const previous = Array.isArray(manifest.meta?.generated)
      ? (manifest.meta.generated as string[])
      : [];
    const keep = new Set(generated);
    for (const file of previous) {
      if (keep.has(file)) continue;
      await removeFile(resolve(outDir, file));
    }
  } catch {
    warnings.push(`Could not read previous ${manifestFile}; skipped --clean`);
  }
}

export function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}

function clampConcurrency(value: number): number {
  return Math.max(1, Math.min(value, 4));
}

function toBytes(contents: string | Uint8Array): Uint8Array {
  return typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
