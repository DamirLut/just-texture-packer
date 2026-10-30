import { z } from "zod";

export const SortModeSchema = z.enum(["area-desc", "height-desc", "width-desc", "name"]);
export type SortMode = z.infer<typeof SortModeSchema>;

const OutputSchema = z.object({
  /** Output directory, resolved relative to the config file (or input root). */
  dir: z.string().min(1),
  /** Base name for atlases, e.g. `atlas` -> `atlas.png` / `atlas.json`. */
  name: z.string().min(1),
});

const AtlasOptionsSchema = z.object({
  maxWidth: z.number().int().min(16).max(16384),
  maxHeight: z.number().int().min(16).max(16384),
  /** Round the final page size up to a power of two. */
  powerOfTwo: z.boolean(),
  /** Transparent gap between sprites, px. */
  padding: z.number().int().min(0).max(64),
  /** Duplicate edge pixels around each sprite to avoid bleeding, px. */
  extrude: z.number().int().min(0).max(8),
  allowRotation: z.boolean(),
  sort: SortModeSchema,
  maxPages: z.number().int().min(1).max(1024),
  /** Placeholders: `{name}` and `{page}` (`""` for the first page, `-2`, `-3`…). */
  pageNaming: z.string().min(1),
});

const CropOptionsSchema = z.object({
  /** `auto` trims fully transparent borders (crop); `none` keeps frames as-is. */
  mode: z.enum(["auto", "none"]),
  /** Alpha value (0-255) at or below which a pixel counts as transparent. */
  threshold: z.number().int().min(0).max(255),
  /**
   * How to crop frames of one animation:
   * `union` – one shared rect for all frames (keeps frames aligned),
   * `per-frame` – tight crop for every frame.
   */
  animations: z.enum(["union", "per-frame"]),
});

export const PngEncodeSchema = z.object({
  compressionLevel: z.number().int().min(0).max(9),
  /** `false` = lossless truecolor, number = quantise to N colours (imagequant). */
  palette: z.union([z.literal(false), z.number().int().min(2).max(256)]),
  quality: z.number().min(0).max(100),
  effort: z.number().min(1).max(10),
  dither: z.number().min(0).max(1),
});

const EncodeOptionsSchema = z.object({
  format: z.literal("png"),
  png: PngEncodeSchema,
});

const NamingSchema = z.object({
  /** Standalone sprite names. Placeholders: `{path}` `{name}` `{dir}` `{ext}`. */
  template: z.string().min(1),
  /**
   * Animation frame names.
   * Placeholders: `{name}` (animation name) `{index}` `{path}` `{dir}`.
   */
  frameTemplate: z.string().min(1),
});

const AnimationOptionsSchema = z.object({
  /** Enable automatic animation detection. */
  auto: z.boolean(),
  /** Multi-frame files (GIF, animated WebP) become animations. */
  animatedFiles: z.boolean(),
  /** `name_001.png`, `name-2.png`, … sequences become animations. */
  sequences: z.boolean(),
  /** Regexp with `name` and `index` groups, applied to the file name w/o ext. */
  sequencePattern: z.string(),
  minSequenceLength: z.number().int().min(2),
  /** Fallback frame duration for formats without timing, ms. */
  defaultFrameDuration: z.number().min(1),
});

const ManifestSpecSchema = z.object({ format: z.string().min(1) }).catchall(z.unknown());

export const ConfigSchema = z.object({
  include: z.array(z.string().min(1)).min(1),
  exclude: z.array(z.string()),
  output: OutputSchema,
  atlas: AtlasOptionsSchema,
  crop: CropOptionsSchema,
  encode: EncodeOptionsSchema,
  naming: NamingSchema,
  animations: AnimationOptionsSchema,
  manifests: z.array(ManifestSpecSchema).min(1),
  concurrency: z.number().int().min(1).max(64),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ManifestSpec = z.infer<typeof ManifestSpecSchema>;
export type CropOptions = z.infer<typeof CropOptionsSchema>;
export type AtlasOptions = z.infer<typeof AtlasOptionsSchema>;
export type EncodeOptions = z.infer<typeof EncodeOptionsSchema>;

export const DEFAULT_CONFIG = {
  include: ["**/*.png", "**/*.{jpg,jpeg,webp,gif,avif}"],
  exclude: ["**/.*/**", "**/.*"],
  output: { dir: ".", name: "atlas" },
  atlas: {
    maxWidth: 2048,
    maxHeight: 2048,
    powerOfTwo: true,
    padding: 2,
    extrude: 1,
    allowRotation: false,
    sort: "area-desc",
    maxPages: 32,
    pageNaming: "{name}{page}.png",
  },
  crop: { mode: "auto", threshold: 1, animations: "union" },
  encode: {
    format: "png",
    png: { compressionLevel: 9, palette: false, quality: 100, effort: 8, dither: 0 },
  },
  naming: { template: "{path}", frameTemplate: "{name}_{index:03}" },
  animations: {
    auto: true,
    animatedFiles: true,
    sequences: true,
    sequencePattern: "^(?<name>.+?)[-_ .]?(?<index>\\d+)$",
    minSequenceLength: 2,
    defaultFrameDuration: 100,
  },
  manifests: [{ format: "pixi" }],
  concurrency: 8,
} satisfies Config;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Type helper for `packer.config.ts`. */
export function defineConfig(config: DeepPartial<Config>): DeepPartial<Config> {
  return config;
}
