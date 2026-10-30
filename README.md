# just-texture-packer

Bun CLI that takes a folder of images, packs them into an optimized texture atlas and writes
engine manifests next to it (PixiJS 8 first).

- 🔍 scans a folder recursively, config lives in the folder root
- ✂️ crops transparent borders (`crop`), replicates edges (`extrude`), pads sprites
- 🎞️ turns GIFs / animated WebP and `name_001.png` sequences into **animations** automatically
- 🧩 MaxRects packing, multi-page atlases, power-of-two pages — deterministic output
- 🖼️ PNG atlas optimized with libvips/imagequant (`palette: 256` for pixel art)
- 📄 format-neutral core: `PixiAdapter` today, any engine tomorrow
- ✅ `--check` for CI, `--dry-run`, `--clean`

## Requirements

- [Bun](https://bun.sh) ≥ 1.4
- macOS / Linux / Windows (pixel work is done by `sharp`)

## Install & run

```bash
bun install
bun run jtp --help

# or as a bin from another project
bun link            # then: jtp pack ./assets
```

## Quick start

```bash
# 1. starter config in the assets folder root
jtp init ./assets

# 2. pack
jtp pack ./assets

# assets/packer.config.ts -> ../client/public/sprites/{atlas.png,atlas.json}
```

```
input  /game/assets
output /game/client/public/sprites
✓ ../../game/client/public/sprites: 1 page · 16 frames · 2 animations
  atlas.png  32×1024  1.3 KB  (16 frames)
  atlas.json
  source 8.7 KB → atlas 1.3 KB (−85%) · 16 ms
```

## CLI

```
jtp pack [dir] [options]     scan <dir>, pack, write atlas + manifests
jtp init [dir] [--json]      write a starter config (packer.config.ts)
jtp help | jtp --version

  -c, --config <file>   config path (default: auto-discovered in <dir>)
  -o, --out <dir>       output directory (overrides config)
      --name <base>     atlas base name, e.g. atlas -> atlas.png / atlas.json
  -f, --format <ids>    manifest formats, comma separated (pixi)
      --max-size <WxH>  max page size, e.g. 2048x2048
      --padding <n>     transparent gap between sprites
      --extrude <n>     edge replication around sprites
      --no-trim         keep transparent borders (disable cropping)
      --no-animations   disable animation auto-detection
  -j, --jobs <n>        parallel decode/encode jobs
      --dry-run         compute everything, write nothing
      --check           exit code 3 when generated files are stale
      --clean           delete pages left over from a previous run
      --json            print the machine-readable report to stdout
  -v, --verbose / -q, --quiet
```

Exit codes: `0` ok, `1` config error, `2` image/pack error, `3` stale artifacts (`--check`).

### CI

```bash
jtp pack ./assets --check   # fails when the checked-in atlas is out of date
```

`--check` recomputes everything in memory and compares bytes against the files on disk.
The manifest also carries `meta.hash` (sources + config + packer version).

## Config

Auto-discovered in the input folder root, first match wins:
`packer.config.ts` → `packer.config.js` → `jtp.config.ts` → `packer.config.json` → `.jtp.json`.
`.ts` / `.js` configs are imported natively by Bun (default export).

```ts
/** @type {import("just-texture-packer").DeepPartial<import("just-texture-packer").Config>} */
export default {
  include: ["**/*.png", "**/*.{jpg,jpeg,webp,gif,avif}"],
  exclude: ["**/.*/**"],

  // resolved relative to the config file (absolute paths allowed)
  output: { dir: "../client/public/sprites", name: "atlas" },

  atlas: {
    maxWidth: 2048,
    maxHeight: 2048,
    powerOfTwo: true,
    padding: 2,            // transparent gap between sprites
    extrude: 1,            // replicated edge pixels (anti-bleeding)
    allowRotation: false,  // 90° CW rotation when it saves space
    sort: "area-desc",     // area-desc | height-desc | width-desc | name
    maxPages: 32,
    pageNaming: "{name}{page}.png", // atlas.png, atlas-2.png, …
  },

  crop: {
    mode: "auto",          // auto = trim transparent borders, none = keep as-is
    threshold: 1,          // alpha <= threshold is transparent
    animations: "union",   // union | per-frame (crop rect for animation frames)
  },

  encode: {
    format: "png",
    png: {
      compressionLevel: 9,
      palette: 256,        // false = lossless truecolour, number = quantise
      quality: 100,
      effort: 8,
      dither: 0,
    },
  },

  naming: {
    template: "{path}",              // ui/button.png -> ui/button
    frameTemplate: "{name}_{index:03}", // hero/run -> hero/run_000
  },

  animations: {
    auto: true,
    animatedFiles: true,   // GIF / animated WebP -> animation
    sequences: true,       // name_001.png, name-002.png -> animation
    sequencePattern: "^(?<name>.+?)[-_ .]?(?<index>\\d+)$",
    minSequenceLength: 2,
    defaultFrameDuration: 100, // ms, used for numbered sequences
  },

  manifests: [
    { format: "pixi", file: "atlas.json", version: 8 },
  ],

  concurrency: 8,
};
```

Precedence: **CLI flags > config file > defaults**. Nested objects are deep-merged, arrays replaced.

### Templates

| Placeholder | Value |
|---|---|
| `{path}` | relative path without extension (`ui/button`) |
| `{name}` | file name without extension (`button`), or animation name |
| `{dir}` | parent folder (`ui`) |
| `{ext}` | source extension (`png`) |
| `{index}`, `{index:03}` | animation frame index, optional zero padding |

Frame names must be unique; the packer fails with a hint if a template collides.

### Animations

| Source | Result |
|---|---|
| `hero/idle.gif` (8 frames) | animation `hero/idle`, frames `hero/idle_000…007`, duration from GIF delays |
| `hero/run_001.png…003.png` | animation `hero/run`, frames `hero/run_000…002`, 100 ms per frame |
| `ui/button.png` | sprite `ui/button` |
| multi-frame PNGs are not split | one sprite per file |

Animation frames are packed as a unit: an animation never spans two atlas pages.
If it cannot fit on one page you get a clear `PackError` hint instead of a broken spritesheet.

### Crop

`crop.mode: "auto"` finds the alpha bounding box of each frame:

- sprites are cropped per frame (`spriteSourceSize` records the offset),
- animation frames share one crop rect (`crop.animations: "union"`) so frames stay aligned;
  use `"per-frame"` for tighter (but individually offset) frames.

## Output

```
sprites/
  atlas.png      # page 1
  atlas-2.png    # page 2, when the sprites do not fit
  atlas.json     # PixiJS 8 spritesheet
  atlas-2.json   # pages 2+ manifest, linked via meta.related_multi_packs
```

Pixi manifest (abridged):

```json
{
  "frames": {
    "ui/button": {
      "frame": { "x": 0, "y": 0, "w": 20, "h": 20 },
      "rotated": false,
      "trimmed": true,
      "spriteSourceSize": { "x": 5, "y": 5, "w": 20, "h": 20 },
      "sourceSize": { "w": 32, "h": 32 }
    }
  },
  "animations": { "hero/idle": ["hero/idle_000", "hero/idle_001"] },
  "meta": {
    "app": "just-texture-packer",
    "version": "8",
    "image": "atlas.png",
    "format": "RGBA8888",
    "size": { "w": 32, "h": 1024 },
    "scale": "1",
    "animations": { "hero/idle": { "frames": 2, "duration": 160, "fps": 12.5 } },
    "generated": ["atlas.png", "atlas.json"],
    "hash": "…"
  }
}
```

## Extending

### New manifest format

1. `src/formats/myformat.ts` — implement `ManifestAdapter` (a zod options schema + `build(result, options, context)`),
2. register it in `src/formats/index.ts`,
3. use `manifests: [{ format: "myformat" }]` in the config.

`build()` receives a format-neutral `AtlasResult` (pages, frames, animations, hash) and returns
file contents — adapters never touch pixels or the filesystem.

### Different pixel backend

`src/image/codec.ts` defines `ImageCodec` (`decode` + `encodePng`). The pipeline accepts a custom
codec via `runPipeline({ codec })`, so a pure-JS/WASM implementation can replace `sharp`.

### Different runtime

All runtime-specific APIs (file system, globbing, hashing, argv, stdio, dynamic config import) sit
behind `Platform` in `src/platform/contract.ts`, with a single Bun implementation in
`src/platform/bun.ts`. Swap `platform` in `src/platform/index.ts` (or pass an implementation) to run
the packer on another runtime — `Bun.*` does not appear anywhere else in the codebase.

## Limitations

- `bun build --compile` binaries cannot load `sharp` (native addons + `$bunfs`); run the CLI with
  Bun (`bunx`/`jtp`) or ship `node_modules` alongside. A pure-JS codec would lift this.
- v1 writes PNG pages only; WebP/AVIF pages and `@2x` scale variants are on the roadmap.
- No watch mode yet (`--dry-run` + your own watcher is the workaround).

## Development

```bash
bun test          # 47 tests: packing invariants, crop, rotation, pipeline, CLI args, logger
bun run typecheck
bun run fmt
```