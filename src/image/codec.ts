import type { RawSource } from "#core/types";
import type { PngOptions } from "./encode";
import { decodeSource } from "./decoder";
import { encodePng } from "./encode";

/**
 * Pluggable pixel backend.
 *
 * The pipeline only talks to this interface, so a pure-JS (or WASM) codec can
 * replace `sharp` without touching packing, layout or manifests.
 */
export interface ImageCodec {
  readonly id: string;
  /** Lower-case extensions (with dot) the codec can read. */
  readonly extensions: readonly string[];
  decode(absPath: string, rel: string): Promise<RawSource>;
  encodePng(
    data: Uint8Array,
    width: number,
    height: number,
    options: PngOptions,
  ): Promise<Uint8Array>;
}

export const sharpCodec: ImageCodec = {
  id: "sharp",
  extensions: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"],
  decode: decodeSource,
  encodePng,
};

export const defaultCodec: ImageCodec = sharpCodec;
