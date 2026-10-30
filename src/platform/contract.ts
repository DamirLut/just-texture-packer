/**
 * Runtime contract.
 *
 * Everything runtime-specific (Bun today, Node/Deno/plain JS tomorrow) lives
 * behind this interface. Application code imports the helpers from `#utils/*`
 * and never touches `Bun.*` directly.
 */

export interface Writable {
  write(chunk: string): unknown;
}

export interface GlobMatcher {
  match(path: string): boolean;
}

export interface FileSystem {
  readBytes(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  readJson<T = unknown>(path: string): Promise<T>;
  /** Writes a file, creating parent directories when needed. */
  writeFile(path: string, contents: string | Uint8Array): Promise<void>;
  ensureDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  isDirectory(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export type HashAlgorithm = "sha256";

export interface Platform {
  readonly name: string;
  readonly fs: FileSystem;
  /** Raw process arguments (`[runtime, script?, ...userArgs]`). */
  readonly argv: readonly string[];
  readonly stdout: Writable;
  readonly stderr: Writable;
  readonly stderrIsTTY: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  cwd(): string;
  setExitCode(code: number): void;
  hash(algorithm: HashAlgorithm, parts: readonly (string | Uint8Array)[]): string;
  /** Async iteration over files matching a glob, relative to `cwd`. */
  glob(pattern: string, cwd: string): AsyncIterable<string>;
  globMatcher(pattern: string): GlobMatcher;
  /**
   * Dynamic import used to load user config files at build time.
   * This is the only place where the codebase imports a module by runtime path.
   */
  importModule(path: string): Promise<Record<string, unknown>>;
  /** Monotonic clock in milliseconds. */
  now(): number;
}
