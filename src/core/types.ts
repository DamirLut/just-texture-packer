export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

/** A decoded (but not yet cropped) image frame. `data` is RGBA8. */
export interface RawFrame {
  width: number;
  height: number;
  data: Uint8Array;
  /** Frame duration in ms (0 for still images). */
  duration: number;
}

/**
 * One discovered source file.
 * `animated` sources (GIF / animated WebP) produce one logical animation.
 */
export interface RawSource {
  /** Path relative to the input root, POSIX separators. */
  rel: string;
  kind: "static" | "animated";
  frames: RawFrame[];
  /** Delay of the first frame in ms, used for static images = 0. */
}

/** Frame geometry/content after cropping (trimming) transparent edges. */
export interface TrimmedFrame {
  data: Uint8Array;
  width: number;
  height: number;
  /** Offset of the cropped content inside the original frame. */
  offsetX: number;
  offsetY: number;
  sourceWidth: number;
  sourceHeight: number;
  trimmed: boolean;
}

/** A frame ready for packing, with its final manifest name. */
export interface Frame extends TrimmedFrame {
  /** Manifest key, e.g. `ui/button` or `hero/run_000`. */
  name: string;
  /** Index inside the animation, or 0 for a standalone sprite. */
  index: number;
  /** Animation name, or null for a standalone sprite. */
  animation: string | null;
  /** Duration in ms (0 for still images). */
  duration: number;
  /** Source path relative to the input root. */
  source: string;
}

/** A frame placed on an atlas page. `rect` is the sprite rect (without extrude). */
export interface PlacedFrame {
  frame: Frame;
  page: number;
  rect: Rect;
  rotated: boolean;
}

export interface AtlasPageInfo {
  index: number;
  /** File name of the page image, e.g. `atlas.png`. */
  file: string;
  width: number;
  height: number;
}

/** Format-neutral description of a packed frame, consumed by manifest adapters. */
export interface AtlasFrameEntry {
  name: string;
  page: number;
  /** Region inside the atlas page. For rotated frames `w`/`h` are swapped. */
  frame: Rect;
  rotated: boolean;
  trimmed: boolean;
  /** Size of the original (untrimmed) frame. */
  sourceSize: Size;
  /** Offset of the trimmed content inside the original frame. */
  sourceOffset: { x: number; y: number };
}

export interface AtlasAnimationInfo {
  name: string;
  frames: string[];
  /** Total duration in ms. */
  duration: number;
  fps: number;
}

/** Everything a manifest adapter needs, independent of the output format. */
export interface AtlasResult {
  pages: AtlasPageInfo[];
  frames: AtlasFrameEntry[];
  animations: AtlasAnimationInfo[];
  scale: number;
  hash: string;
  /** File names produced by the whole run (pages + manifests). */
  generated: string[];
}

export interface ManifestFile {
  /** File name, relative to the output directory. */
  file: string;
  contents: string | Uint8Array;
}
