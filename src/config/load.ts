import { dirname, resolve } from "node:path";
import { platform } from "#platform";
import { ConfigError } from "#core/errors";
import { fileExists, readJson } from "#utils/fs";
import { ConfigSchema, DEFAULT_CONFIG, type Config } from "./schema";

const CONFIG_CANDIDATES = [
  "packer.config.ts",
  "packer.config.mts",
  "packer.config.js",
  "packer.config.mjs",
  "jtp.config.ts",
  "jtp.config.js",
  "packer.config.json",
  "jtp.config.json",
  ".jtp.json",
];

export interface CliOverrides {
  config?: string;
  out?: string;
  name?: string;
  formats?: string[];
  maxWidth?: number;
  maxHeight?: number;
  padding?: number;
  extrude?: number;
  crop?: boolean;
  animations?: boolean;
}

export interface LoadedConfig {
  config: Config;
  /** Directory the config belongs to; relative paths in the config use it. */
  baseDir: string;
  configPath: string | null;
}

export async function loadConfig(
  rootDir: string,
  overrides: CliOverrides = {},
): Promise<LoadedConfig> {
  const root = resolve(rootDir);
  const configPath = overrides.config ? resolve(overrides.config) : await findConfig(root);

  if (overrides.config && !(await fileExists(configPath as string))) {
    throw new ConfigError(`Config not found: ${configPath}`);
  }

  const raw = configPath ? await readConfig(configPath) : {};
  const merged = deepMerge(
    structuredClone(DEFAULT_CONFIG as unknown as Record<string, unknown>),
    applyOverrides(raw, overrides),
  );

  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(
      `Invalid configuration${configPath ? ` in ${configPath}` : ""}:\n${issues}`,
      "Check the config schema in README.md.",
    );
  }

  return {
    config: parsed.data,
    baseDir: configPath ? dirname(configPath) : root,
    configPath,
  };
}

async function findConfig(root: string): Promise<string | null> {
  for (const candidate of CONFIG_CANDIDATES) {
    const path = resolve(root, candidate);
    if (await fileExists(path)) return path;
  }
  return null;
}

async function readConfig(path: string): Promise<Record<string, unknown>> {
  try {
    if (path.endsWith(".json")) {
      return await readJson<Record<string, unknown>>(path);
    }
    const mod = await platform.importModule(path);
    const value = mod.default ?? mod;
    if (typeof value !== "object" || value === null) {
      throw new ConfigError(`Config ${path} must export an object (default export).`);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(`Cannot load config ${path}: ${(error as Error).message}`);
  }
}

/** CLI flags win over the config file. */
function applyOverrides(
  raw: Record<string, unknown>,
  overrides: CliOverrides,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  const atlas: Record<string, unknown> = { ...((out.atlas as Record<string, unknown>) ?? {}) };
  if (overrides.maxWidth !== undefined) atlas.maxWidth = overrides.maxWidth;
  if (overrides.maxHeight !== undefined) atlas.maxHeight = overrides.maxHeight;
  if (overrides.padding !== undefined) atlas.padding = overrides.padding;
  if (overrides.extrude !== undefined) atlas.extrude = overrides.extrude;
  if (Object.keys(atlas).length > 0) out.atlas = atlas;

  const output: Record<string, unknown> = { ...((out.output as Record<string, unknown>) ?? {}) };
  if (overrides.out !== undefined) output.dir = resolve(platform.cwd(), overrides.out);
  if (overrides.name !== undefined) output.name = overrides.name;
  if (Object.keys(output).length > 0) out.output = output;

  const crop: Record<string, unknown> = { ...((out.crop as Record<string, unknown>) ?? {}) };
  if (overrides.crop !== undefined) crop.mode = overrides.crop ? "auto" : "none";
  if (Object.keys(crop).length > 0) out.crop = crop;

  const animations: Record<string, unknown> = {
    ...((out.animations as Record<string, unknown>) ?? {}),
  };
  if (overrides.animations !== undefined) animations.auto = overrides.animations;
  if (Object.keys(animations).length > 0) out.animations = animations;

  if (overrides.formats?.length) {
    const existing = Array.isArray(out.manifests)
      ? (out.manifests as Record<string, unknown>[])
      : [];
    out.manifests = overrides.formats.map((format) => {
      const match = existing.find((entry) => entry.format === format);
      return match ?? { format };
    });
  }

  return out;
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch === undefined ? base : (patch as T);
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
