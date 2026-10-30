import { dirname } from "node:path";
import { OutputError } from "#core/errors";
import { platform } from "#platform";

export async function ensureDir(path: string): Promise<void> {
  await platform.fs.ensureDir(path);
}

export async function fileExists(path: string): Promise<boolean> {
  return platform.fs.exists(path);
}

export async function isDirectory(path: string): Promise<boolean> {
  return platform.fs.isDirectory(path);
}

export async function fileSize(path: string): Promise<number> {
  return platform.fs.size(path);
}

export async function readBytes(path: string): Promise<Uint8Array> {
  return platform.fs.readBytes(path);
}

export async function readText(path: string): Promise<string> {
  return platform.fs.readText(path);
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  return platform.fs.readJson<T>(path);
}

export async function removeFile(path: string): Promise<void> {
  await platform.fs.remove(path);
}

/**
 * Write via a temporary file + rename so readers never see a half-written atlas.
 */
export async function writeFileAtomic(path: string, contents: string | Uint8Array): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await platform.fs.ensureDir(dirname(path));
    await platform.fs.writeFile(tmp, contents);
    await platform.fs.rename(tmp, path);
  } catch (error) {
    await platform.fs.remove(tmp);
    throw new OutputError(`Cannot write ${path}: ${(error as Error).message}`);
  }
}
