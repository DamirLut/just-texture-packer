import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { Glob } from "bun";
import type { FileSystem, GlobMatcher, Platform } from "./contract";

const fs: FileSystem = {
  async readBytes(path) {
    return new Uint8Array(await Bun.file(path).arrayBuffer());
  },

  async readText(path) {
    return Bun.file(path).text();
  },

  async readJson<T>(path: string): Promise<T> {
    return (await Bun.file(path).json()) as T;
  },

  async writeFile(path, contents) {
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, contents);
  },

  async ensureDir(path) {
    await mkdir(path, { recursive: true });
  },

  async exists(path) {
    return Bun.file(path).exists();
  },

  async isDirectory(path) {
    const info = await stat(path).catch(() => null);
    return info?.isDirectory() ?? false;
  },

  async size(path) {
    return Bun.file(path).size;
  },

  async remove(path) {
    try {
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  },

  async rename(from, to) {
    await rename(from, to);
  },
};

/** Bun-backed platform implementation. All Bun APIs are confined to this file. */
export const bunPlatform: Platform = {
  name: "bun",
  fs,
  argv: process.argv,
  stdout: process.stdout,
  stderr: process.stderr,
  stderrIsTTY: Boolean(process.stderr.isTTY),
  env: process.env,

  cwd() {
    return process.cwd();
  },

  setExitCode(code) {
    process.exitCode = code;
  },

  hash(algorithm, parts) {
    const hasher = new Bun.CryptoHasher(algorithm);
    for (const part of parts) {
      hasher.update(typeof part === "string" ? new TextEncoder().encode(part) : part);
    }
    return hasher.digest("hex");
  },

  glob(pattern, cwd) {
    return new Glob(pattern).scan({ cwd, onlyFiles: true, dot: false });
  },

  globMatcher(pattern): GlobMatcher {
    const glob = new Glob(pattern);
    return { match: (path) => glob.match(path) };
  },

  importModule(path) {
    // Cache-bust so re-running a pipeline in the same process picks up config edits.
    const url = `${pathToFileURL(path).href}?t=${Date.now()}`;
    return import(url) as Promise<Record<string, unknown>>;
  },

  now() {
    return performance.now();
  },
};
