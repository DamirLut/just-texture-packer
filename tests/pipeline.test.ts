import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { silentLogger } from "#core/logger";
import { runPipeline, type PackReport } from "#core/pipeline";
import type { Config } from "#config/schema";
import { fileExists, readBytes, readJson, readText } from "#utils/fs";
import { makeConfig, readPixel, writeGif, writePng } from "./helpers";

const RED = [255, 0, 0, 255] as const;
const GREEN = [0, 255, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;
const YELLOW = [255, 255, 0, 255] as const;

let root: string;
let assets: string;
let out: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jtp-test-"));
  assets = join(root, "assets");
  out = join(root, "out");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function buildScene(): Promise<void> {
  await writePng(
    join(assets, "ui/button.png"),
    { w: 32, h: 32 },
    { x: 5, y: 5, w: 20, h: 20 },
    RED,
  );
  await writePng(
    join(assets, "hero/run_001.png"),
    { w: 16, h: 16 },
    { x: 0, y: 0, w: 16, h: 16 },
    GREEN,
  );
  await writePng(
    join(assets, "hero/run_002.png"),
    { w: 16, h: 16 },
    { x: 0, y: 0, w: 16, h: 16 },
    BLUE,
  );
  await writePng(
    join(assets, "hero/run_003.png"),
    { w: 16, h: 16 },
    { x: 0, y: 0, w: 16, h: 16 },
    YELLOW,
  );
  await writeGif(
    join(assets, "hero/idle.gif"),
    { w: 10, h: 12 },
    [
      { rect: { x: 1, y: 1, w: 6, h: 6 }, color: [10, 20, 30, 255] },
      { rect: { x: 2, y: 2, w: 6, h: 6 }, color: [40, 50, 60, 255] },
    ],
    80,
  );
}

async function run(
  config: Config,
  flags: Parameters<typeof runPipeline>[1] = {},
): Promise<PackReport> {
  return runPipeline(
    { rootDir: assets, baseDir: root, config, configPath: null, logger: silentLogger },
    flags,
  );
}

async function readManifest(file = "atlas.json"): Promise<Record<string, any>> {
  return readJson<Record<string, any>>(join(out, file));
}

describe("pipeline", () => {
  test("packs sprites, sequences and gif animations into a pixi manifest", async () => {
    await buildScene();
    const config = makeConfig(
      { atlas: { powerOfTwo: false }, output: { dir: out, name: "atlas" } },
      root,
    );
    const report = await run(config);

    expect(report.frames).toBe(6);
    expect(report.sprites).toBe(1);
    expect(report.animations).toBe(2);
    expect(report.pages).toHaveLength(1);
    expect(report.manifests).toEqual(["atlas.json"]);

    const manifest = await readManifest();
    const names = Object.keys(manifest.frames).sort();
    expect(names).toEqual([
      "hero/idle_000",
      "hero/idle_001",
      "hero/run_000",
      "hero/run_001",
      "hero/run_002",
      "ui/button",
    ]);

    // trimmed static sprite keeps its source size and offset
    expect(manifest.frames["ui/button"]).toMatchObject({
      frame: { w: 20, h: 20 },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: 5, y: 5, w: 20, h: 20 },
      sourceSize: { w: 32, h: 32 },
    });

    // animations are grouped and keep order
    expect(manifest.animations["hero/run"]).toEqual([
      "hero/run_000",
      "hero/run_001",
      "hero/run_002",
    ]);
    expect(manifest.animations["hero/idle"]).toEqual(["hero/idle_000", "hero/idle_001"]);
    expect(manifest.meta.animations["hero/idle"]).toMatchObject({ frames: 2, duration: 160 });

    // gif frames share one crop rect (union), so offsets match
    expect(manifest.frames["hero/idle_000"].sourceSize).toEqual({ w: 10, h: 12 });
    expect(manifest.frames["hero/idle_000"].spriteSourceSize).toEqual({ x: 1, y: 1, w: 7, h: 7 });
    expect(manifest.frames["hero/idle_001"].spriteSourceSize).toEqual({ x: 1, y: 1, w: 7, h: 7 });

    // meta matches the actual image
    const meta = await sharp(join(out, "atlas.png")).metadata();
    expect(manifest.meta.image).toBe("atlas.png");
    expect(manifest.meta.size).toEqual({ w: meta.width, h: meta.height });
    expect(manifest.meta.generated.sort()).toEqual(["atlas.json", "atlas.png"]);
    expect(report.atlasBytes).toBeGreaterThan(0);

    // pixels landed where the manifest says
    const button = manifest.frames["ui/button"].frame;
    expect(await readPixel(join(out, "atlas.png"), button.x, button.y)).toEqual([...RED]);
    expect(await readPixel(join(out, "atlas.png"), button.x - 1, button.y)).toEqual([...RED]);
  });

  test("is deterministic across runs", async () => {
    await buildScene();
    const config = makeConfig({ output: { dir: out, name: "atlas" } }, root);
    await run(config);
    const firstImage = await readBytes(join(out, "atlas.png"));
    const firstManifest = await readText(join(out, "atlas.json"));

    await run(config);
    const secondImage = await readBytes(join(out, "atlas.png"));
    const secondManifest = await readText(join(out, "atlas.json"));

    expect(Buffer.from(secondImage).equals(Buffer.from(firstImage))).toBe(true);
    expect(secondManifest).toBe(firstManifest);
  });

  test("--dry-run writes nothing", async () => {
    await buildScene();
    const config = makeConfig({ output: { dir: out, name: "atlas" } }, root);
    const report = await run(config, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.written).toEqual([]);
    expect(await fileExists(join(out, "atlas.png"))).toBe(false);
  });

  test("--check reports up-to-date and stale artifacts", async () => {
    await buildScene();
    const config = makeConfig({ output: { dir: out, name: "atlas" } }, root);

    const fresh = await run(config, { check: true });
    expect(fresh.check?.ok).toBe(false);
    expect(fresh.check?.differences).toContain("atlas.png: missing");

    await run(config);
    const upToDate = await run(config, { check: true });
    expect(upToDate.check).toEqual({ ok: true, differences: [] });

    await writePng(join(assets, "ui/extra.png"), { w: 8, h: 8 }, { x: 1, y: 1, w: 6, h: 6 }, GREEN);
    const stale = await run(config, { check: true });
    expect(stale.check?.ok).toBe(false);
    expect(stale.check?.differences.length).toBeGreaterThan(0);
  });

  test("pages spill over and stale pages are cleaned", async () => {
    for (let index = 0; index < 16; index++) {
      await writePng(
        join(assets, `block_${index}.png`),
        { w: 32, h: 32 },
        { x: 0, y: 0, w: 32, h: 32 },
        [index * 10, 0, 0, 255],
      );
    }

    const small = makeConfig(
      {
        output: { dir: out, name: "atlas" },
        animations: { auto: false },
        atlas: { maxWidth: 64, maxHeight: 64, powerOfTwo: false, padding: 0, extrude: 0 },
      },
      root,
    );
    const multi = await run(small);
    expect(multi.pages.length).toBeGreaterThan(1);
    expect(multi.pages[1]?.file).toBe("atlas-2.png");
    expect(await fileExists(join(out, "atlas-2.png"))).toBe(true);

    const big = makeConfig(
      {
        output: { dir: out, name: "atlas" },
        animations: { auto: false },
        atlas: { maxWidth: 256, maxHeight: 256, powerOfTwo: false, padding: 0, extrude: 0 },
      },
      root,
    );
    const single = await run(big, { clean: true });
    expect(single.pages).toHaveLength(1);
    expect(await fileExists(join(out, "atlas-2.png"))).toBe(false);
    expect(await fileExists(join(out, "atlas-2.json"))).toBe(false);
  });

  test("power-of-two pages are rounded up", async () => {
    await writePng(join(assets, "a.png"), { w: 30, h: 20 }, { x: 0, y: 0, w: 30, h: 20 }, RED);
    const config = makeConfig(
      {
        output: { dir: out, name: "atlas" },
        atlas: { powerOfTwo: true, extrude: 0, padding: 0 },
      },
      root,
    );
    const report = await run(config);
    expect(report.pages[0]).toMatchObject({ width: 32, height: 32 });
  });

  test("crop can be disabled and names can be templated", async () => {
    await buildScene();
    const config = makeConfig(
      {
        output: { dir: out, name: "atlas" },
        crop: { mode: "none" },
        naming: { template: "{name}", frameTemplate: "{name}-f{index}" },
        animations: { auto: true, sequences: true },
      },
      root,
    );
    const report = await run(config);
    const manifest = await readManifest();

    expect(Object.keys(manifest.frames).sort()).toEqual([
      "button",
      "idle-f0",
      "idle-f1",
      "run-f0",
      "run-f1",
      "run-f2",
    ]);
    expect(manifest.frames["button"].trimmed).toBe(false);
    expect(manifest.frames["button"].frame).toMatchObject({ w: 32, h: 32 });
    expect(report.warnings.some((warning) => warning.includes("crop.mode = none"))).toBe(true);
  });

  test("animations can be disabled", async () => {
    await buildScene();
    const config = makeConfig(
      {
        output: { dir: out, name: "atlas" },
        animations: { auto: false },
      },
      root,
    );
    const report = await run(config);
    expect(report.animations).toBe(0);
    expect(report.sprites).toBe(5);
    expect(await fileExists(join(out, "atlas.json"))).toBe(true);
  });

  test("reports a helpful error when nothing is found", async () => {
    await writePng(join(assets, "only.png"), { w: 8, h: 8 }, { x: 0, y: 0, w: 8, h: 8 }, RED);
    const config = makeConfig({ output: { dir: out, name: "atlas" }, include: ["**/*.jpg"] }, root);
    await expect(run(config)).rejects.toThrow(/No images found/);
  });

  test("does not ingest its own output when it lives inside the input root", async () => {
    const nestedOut = join(assets, "sprites");
    await writePng(join(assets, "a.png"), { w: 8, h: 8 }, { x: 0, y: 0, w: 8, h: 8 }, RED);
    const config = makeConfig(
      { output: { dir: nestedOut, name: "atlas" }, atlas: { powerOfTwo: false } },
      root,
    );
    await run(config);
    const second = await run(config);
    expect(second.frames).toBe(1);
    expect(second.pages).toHaveLength(1);
  });
});
