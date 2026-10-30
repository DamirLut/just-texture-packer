import sharp, { type Metadata } from "sharp";
import { ImageError } from "#core/errors";
import type { RawFrame, RawSource } from "#core/types";

/** Guard against decompression bombs / accidental 8K+ sheets. */
const MAX_PIXELS = 64 * 1024 * 1024;

/**
 * Decode one file into RGBA frames.
 * Multi-page images (GIF, animated WebP) come back as a vertical stack of
 * coalesced frames, which is exactly what we need for an animation.
 */
export async function decodeSource(absPath: string, rel: string): Promise<RawSource> {
  let meta: Metadata;
  try {
    meta = await sharp(absPath, { animated: true }).metadata();
  } catch (error) {
    throw new ImageError(`Cannot read ${rel}: ${(error as Error).message}`);
  }

  const width = meta.width ?? 0;
  const pages = Math.max(1, meta.pages ?? 1);
  const frameHeight = meta.pageHeight ?? meta.height ?? 0;
  if (!width || !frameHeight) {
    throw new ImageError(`${rel}: unsupported or empty image`);
  }
  if (width * frameHeight * pages > MAX_PIXELS) {
    throw new ImageError(
      `${rel}: image is too large (${width}x${frameHeight * pages})`,
      "Split the source into smaller files.",
    );
  }

  let data: Uint8Array;
  try {
    const pipeline = pages > 1 ? sharp(absPath, { animated: true }) : sharp(absPath);
    const result = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    data = result.data;
  } catch (error) {
    throw new ImageError(`Cannot decode ${rel}: ${(error as Error).message}`);
  }

  const delays = normalizeDelays(meta.delay, pages, 0);
  const frames: RawFrame[] = [];
  const rowBytes = width * 4;

  for (let index = 0; index < pages; index++) {
    const start = index * frameHeight * rowBytes;
    const end = start + frameHeight * rowBytes;
    frames.push({
      width,
      height: frameHeight,
      data: data.subarray(start, end),
      duration: delays[index] ?? 0,
    });
  }

  return {
    rel,
    kind: pages > 1 ? "animated" : "static",
    frames,
  };
}

function normalizeDelays(
  delay: number | number[] | undefined,
  pages: number,
  fallback: number,
): number[] {
  if (Array.isArray(delay)) {
    return Array.from({ length: pages }, (_, index) => delay[index] ?? delay[0] ?? fallback);
  }
  if (typeof delay === "number") {
    return Array.from({ length: pages }, () => delay);
  }
  return Array.from({ length: pages }, () => fallback);
}
