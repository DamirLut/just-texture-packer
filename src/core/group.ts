import type { Config } from "#config/schema";
import { ConfigError } from "./errors";
import type { RawFrame, RawSource } from "./types";
import { baseName, dirName, extensionOf, formatTemplate, stripExtension } from "#utils/name";

export interface FrameGroup {
  /** `animation` groups must stay on one atlas page. */
  kind: "sprite" | "animation";
  /** Sprite name or animation name. */
  name: string;
  /** Source path relative to the input root (POSIX). */
  source: string;
  frames: RawFrame[];
  /** Per-frame durations in ms. */
  durations: number[];
}

interface SequenceMatch {
  name: string;
  index: number;
}

/**
 * Turns decoded sources into sprite/animation groups:
 * - multi-frame files (GIF/animated WebP) -> one animation;
 * - `name_001.png` / `name-2.png` sequences -> one animation;
 * - everything else -> a standalone sprite.
 */
export function buildGroups(sources: RawSource[], config: Config): FrameGroup[] {
  const groups: FrameGroup[] = [];
  const sequences = new Map<
    string,
    { dir: string; prefix: string; entries: (SequenceMatch & { source: RawSource })[] }
  >();

  const auto = config.animations.auto;
  const pattern =
    auto && config.animations.sequences
      ? compileSequencePattern(config.animations.sequencePattern)
      : null;

  for (const source of sources) {
    if (auto && config.animations.animatedFiles && source.kind === "animated") {
      groups.push({
        kind: "animation",
        name: groupName(source.rel, config),
        source: source.rel,
        frames: source.frames,
        durations: source.frames.map(
          (frame) => frame.duration || config.animations.defaultFrameDuration,
        ),
      });
      continue;
    }

    const relNoExt = stripExtension(source.rel);
    const match = pattern ? matchSequence(baseName(relNoExt), pattern) : null;
    if (match) {
      const key = `${dirName(relNoExt)}|${match.name}`;
      let bucket = sequences.get(key);
      if (!bucket) {
        bucket = { dir: dirName(relNoExt), prefix: match.name, entries: [] };
        sequences.set(key, bucket);
      }
      bucket.entries.push({ ...match, source });
      continue;
    }

    groups.push({
      kind: "sprite",
      name: formatTemplate(config.naming.template, pathVars(source.rel)),
      source: source.rel,
      frames: source.frames,
      durations: [0],
    });
  }

  for (const bucket of sequences.values()) {
    bucket.entries.sort((a, b) => a.index - b.index || (a.source.rel < b.source.rel ? -1 : 1));

    if (bucket.entries.length >= config.animations.minSequenceLength) {
      const logicalPath = bucket.dir ? `${bucket.dir}/${bucket.prefix}` : bucket.prefix;
      const frames = bucket.entries.flatMap((entry) => entry.source.frames);
      groups.push({
        kind: "animation",
        name: formatTemplate(config.naming.template, pathVars(`${logicalPath}.png`)),
        source: logicalPath,
        frames,
        durations: frames.map(() => config.animations.defaultFrameDuration),
      });
      continue;
    }

    for (const entry of bucket.entries) {
      groups.push({
        kind: "sprite",
        name: formatTemplate(config.naming.template, pathVars(entry.source.rel)),
        source: entry.source.rel,
        frames: entry.source.frames,
        durations: [0],
      });
    }
  }

  groups.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return groups;
}

function groupName(rel: string, config: Config): string {
  return formatTemplate(config.naming.template, pathVars(rel));
}

export function pathVars(rel: string): Record<string, string> {
  const noExt = stripExtension(rel);
  return {
    path: noExt,
    name: baseName(noExt),
    dir: dirName(noExt),
    ext: extensionOf(rel),
  };
}

function compileSequencePattern(source: string): RegExp {
  let pattern: RegExp;
  try {
    pattern = new RegExp(source);
  } catch (error) {
    throw new ConfigError(
      `Invalid animations.sequencePattern "${source}": ${(error as Error).message}`,
    );
  }
  if (!pattern.source.includes("name") || !pattern.source.includes("index")) {
    throw new ConfigError(
      `animations.sequencePattern must contain named groups "name" and "index", got "${source}"`,
    );
  }
  return pattern;
}

function matchSequence(basename: string, pattern: RegExp): SequenceMatch | null {
  const match = pattern.exec(basename);
  if (!match?.groups?.name || match.groups.index === undefined) return null;
  const index = Number(match.groups.index);
  if (!Number.isFinite(index)) return null;
  return { name: match.groups.name, index };
}
