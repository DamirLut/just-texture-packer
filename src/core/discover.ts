import { resolve } from "node:path";
import { platform } from "#platform";
import { isInside, toPosixPath } from "#utils/paths";

export interface DiscoverOptions {
  rootDir: string;
  include: string[];
  exclude: string[];
  /** Absolute path of the output dir; its files are never treated as input. */
  outputDir: string;
  /** Base name of generated pages/manifests, e.g. `atlas`. */
  outputName: string;
}

/** Scan the input root and return a deterministic, sorted list of relative POSIX paths. */
export async function discoverFiles(options: DiscoverOptions): Promise<string[]> {
  const root = resolve(options.rootDir);
  const outputDir = resolve(options.outputDir);
  const excludeMatchers = options.exclude
    .flatMap((pattern) => expandBraces(pattern))
    .map((pattern) => platform.globMatcher(pattern));

  const found = new Set<string>();
  for (const pattern of options.include.flatMap((p) => expandBraces(p))) {
    for await (const file of platform.glob(pattern, root)) {
      const rel = toPosixPath(file);
      if (found.has(rel)) continue;
      if (excludeMatchers.some((matcher) => matcher.match(rel))) continue;
      const abs = resolve(root, rel);
      if (isInside(outputDir, abs) || abs === outputDir) continue;
      if (isGeneratedArtifact(rel, options.outputName)) continue;
      found.add(rel);
    }
  }

  return [...found].sort(comparePaths);
}

/**
 * Skip pages produced by a previous run (they live next to the sources when
 * `output.dir` points at the input root).
 */
function isGeneratedArtifact(rel: string, name: string): boolean {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  const ext = base.slice(base.lastIndexOf(".")).toLowerCase();
  if (![".png", ".webp", ".json", ".atlas"].includes(ext)) return false;
  const stem = base.slice(0, base.length - ext.length);
  if (stem === name) return true;
  return new RegExp(`^${escapeRegExp(name)}-\\d+$`).test(stem);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Expand `{a,b}` alternations (Bun.Glob does not support braces). */
export function expandBraces(pattern: string): string[] {
  const start = pattern.indexOf("{");
  if (start === -1) return [pattern];
  let depth = 0;
  let end = -1;
  for (let i = start; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [pattern];

  const prefix = pattern.slice(0, start);
  const suffix = pattern.slice(end + 1);
  const body = pattern.slice(start + 1, end);
  const parts: string[] = [];
  let buffer = "";
  depth = 0;
  for (const char of body) {
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (char === "," && depth === 0) {
      parts.push(buffer);
      buffer = "";
    } else {
      buffer += char;
    }
  }
  parts.push(buffer);

  return parts.flatMap((part) => expandBraces(prefix + part + suffix));
}
