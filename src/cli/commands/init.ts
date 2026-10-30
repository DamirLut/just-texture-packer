import { resolve } from "node:path";
import { ConfigError } from "#core/errors";
import { DEFAULT_CONFIG } from "#config/schema";
import { fileExists, writeFileAtomic } from "#utils/fs";
import type { ParsedCli } from "../args";
import type { ConsoleLogger } from "../ui/console";

const TS_TEMPLATE = `/**
 * just-texture-packer config.
 *
 * @type {import("just-texture-packer").DeepPartial<import("just-texture-packer").Config>}
 */
export default {
  // Which files are picked up (relative to this config).
  include: ["**/*.png", "**/*.{jpg,jpeg,webp,gif,avif}"],
  exclude: ["**/.*/**"],

  // Atlas pages and manifests are written relative to this config file.
  output: { dir: "./atlas", name: "atlas" },

  atlas: {
    maxWidth: 2048,
    maxHeight: 2048,
    powerOfTwo: true,
    padding: 2,
    extrude: 1,
    allowRotation: false,
    sort: "area-desc",
  },

  // Crop fully transparent borders (makes atlases smaller).
  crop: { mode: "auto", threshold: 1, animations: "union" },

  encode: {
    format: "png",
    // palette: 256 quantises colours (smaller files, slightly lossy).
    png: { compressionLevel: 9, palette: false, quality: 100, effort: 8, dither: 0 },
  },

  naming: { template: "{path}", frameTemplate: "{name}_{index:03}" },

  // GIFs and name_001.png sequences become animations automatically.
  animations: { auto: true, animatedFiles: true, sequences: true, minSequenceLength: 2 },

  // file defaults to <output.name>.json; set it to pin a name.
  manifests: [{ format: "pixi", version: 8 }],
};
`;

const JSON_TEMPLATE = `${JSON.stringify(
  {
    include: DEFAULT_CONFIG.include,
    exclude: DEFAULT_CONFIG.exclude,
    output: { dir: "./atlas", name: "atlas" },
    atlas: DEFAULT_CONFIG.atlas,
    crop: DEFAULT_CONFIG.crop,
    encode: DEFAULT_CONFIG.encode,
    naming: DEFAULT_CONFIG.naming,
    animations: DEFAULT_CONFIG.animations,
    manifests: [{ format: "pixi", version: 8 }],
  },
  null,
  2,
)}\n`;

export async function initCommand(parsed: ParsedCli, logger: ConsoleLogger): Promise<void> {
  const dir = resolve(parsed.positionals[0] ?? ".");
  const file = resolve(dir, parsed.flags.json ? "packer.config.json" : "packer.config.ts");

  if (!parsed.flags.force && (await fileExists(file))) {
    throw new ConfigError(`Config already exists: ${file}`, "Use --force to overwrite it.");
  }

  await writeFileAtomic(file, parsed.flags.json ? JSON_TEMPLATE : TS_TEMPLATE);
  logger.info(`created ${file}`);
}
