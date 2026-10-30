import { platform, type HashAlgorithm } from "#platform";
import { readBytes } from "./fs";

/** Streaming hash over strings and byte arrays. */
export function hash(algorithm: HashAlgorithm, ...parts: (string | Uint8Array)[]): string {
  return platform.hash(algorithm, parts);
}

export function sha256(...parts: (string | Uint8Array)[]): string {
  return hash("sha256", ...parts);
}

export async function sha256File(path: string): Promise<string> {
  return sha256(await readBytes(path));
}

/** Deterministic JSON serialisation (sorted object keys). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
