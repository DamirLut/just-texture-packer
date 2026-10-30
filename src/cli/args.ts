import { ConfigError } from "#core/errors";

export interface CliFlags {
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
  concurrency?: number;
  dryRun: boolean;
  check: boolean;
  clean: boolean;
  json: boolean;
  verbose: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
  force: boolean;
}

export interface ParsedCli {
  command: string;
  positionals: string[];
  flags: CliFlags;
}

interface FlagSpec {
  key: keyof CliFlags;
  type: "string" | "number" | "boolean" | "list" | "size";
}

const LONG_FLAGS: Record<string, FlagSpec> = {
  config: { key: "config", type: "string" },
  out: { key: "out", type: "string" },
  name: { key: "name", type: "string" },
  format: { key: "formats", type: "list" },
  formats: { key: "formats", type: "list" },
  "max-size": { key: "maxWidth", type: "size" },
  padding: { key: "padding", type: "number" },
  extrude: { key: "extrude", type: "number" },
  trim: { key: "crop", type: "boolean" },
  crop: { key: "crop", type: "boolean" },
  animations: { key: "animations", type: "boolean" },
  jobs: { key: "concurrency", type: "number" },
  concurrency: { key: "concurrency", type: "number" },
  "dry-run": { key: "dryRun", type: "boolean" },
  check: { key: "check", type: "boolean" },
  clean: { key: "clean", type: "boolean" },
  json: { key: "json", type: "boolean" },
  force: { key: "force", type: "boolean" },
  verbose: { key: "verbose", type: "boolean" },
  quiet: { key: "quiet", type: "boolean" },
  help: { key: "help", type: "boolean" },
  version: { key: "version", type: "boolean" },
};

const SHORT_FLAGS: Record<string, string> = {
  c: "config",
  o: "out",
  f: "format",
  j: "jobs",
  v: "verbose",
  q: "quiet",
  h: "help",
  V: "version",
};

export function parseArgs(argv: string[]): ParsedCli {
  const positionals: string[] = [];
  const flags: CliFlags = {
    dryRun: false,
    check: false,
    clean: false,
    json: false,
    verbose: false,
    quiet: false,
    help: false,
    version: false,
    force: false,
  };
  let command = "";

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;

    if (arg === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (arg.startsWith("--")) {
      const [rawName, inlineValue] = splitOnce(arg.slice(2), "=");
      const negated = rawName.startsWith("no-");
      const name = negated ? rawName.slice(3) : rawName;
      const spec = LONG_FLAGS[name];
      if (!spec)
        throw new ConfigError(`Unknown flag --${name}`, "Run `jtp --help` for the list of flags.");
      if (negated) {
        (flags[spec.key] as unknown) = false;
        continue;
      }
      const value = spec.type === "boolean" ? undefined : (inlineValue ?? argv[++index]);
      applyFlag(flags, spec, value, name);
      continue;
    }

    if (arg.startsWith("-") && arg.length > 1 && arg !== "-") {
      const short = arg.slice(1);
      const longName = SHORT_FLAGS[short];
      if (!longName)
        throw new ConfigError(`Unknown flag -${short}`, "Run `jtp --help` for the list of flags.");
      const spec = LONG_FLAGS[longName] as FlagSpec;
      const value = spec.type === "boolean" ? undefined : argv[++index];
      applyFlag(flags, spec, value, longName);
      continue;
    }

    if (!command) command = arg;
    else positionals.push(arg);
  }

  if (flags.version) command = command || "version";
  if (flags.help) command = command || "help";
  if (!command) command = "help";

  return { command, positionals, flags };
}

function applyFlag(flags: CliFlags, spec: FlagSpec, value: string | undefined, name: string): void {
  switch (spec.type) {
    case "boolean":
      (flags[spec.key] as unknown) = true;
      return;
    case "string":
      if (value === undefined) throw new ConfigError(`Flag --${name} requires a value`);
      (flags[spec.key] as unknown) = value;
      return;
    case "list":
      if (value === undefined) throw new ConfigError(`Flag --${name} requires a value`);
      (flags[spec.key] as unknown) = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return;
    case "number": {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new ConfigError(`Flag --${name} expects a non-negative number, got "${value}"`);
      }
      (flags[spec.key] as unknown) = parsed;
      return;
    }
    case "size": {
      const match = /^(\d+)(?:[x×*,](\d+))?$/i.exec(value ?? "");
      if (!match) {
        throw new ConfigError(`Flag --${name} expects WxH (e.g. 2048x2048), got "${value}"`);
      }
      flags.maxWidth = Number(match[1]);
      flags.maxHeight = Number(match[2] ?? match[1]);
      return;
    }
  }
}

function splitOnce(value: string, separator: string): [string, string | undefined] {
  const index = value.indexOf(separator);
  if (index === -1) return [value, undefined];
  return [value.slice(0, index), value.slice(index + separator.length)];
}
