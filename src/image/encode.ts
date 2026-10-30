import sharp from "sharp";
import { OutputError } from "#core/errors";
import type { PngEncodeSchema } from "#config/schema";
import type { z } from "zod";

export type PngOptions = z.infer<typeof PngEncodeSchema>;

/** Encode an RGBA page. `palette` enables lossy-ish imagequant quantisation. */
export async function encodePng(
  data: Uint8Array,
  width: number,
  height: number,
  options: PngOptions,
): Promise<Uint8Array> {
  const pipeline = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width, height, channels: 4 },
  }).png({
    compressionLevel: options.compressionLevel,
    effort: options.effort,
    palette: options.palette !== false,
    quality: options.quality,
    colours: options.palette === false ? 256 : options.palette,
    dither: options.dither,
    adaptiveFiltering: false,
  });

  try {
    return new Uint8Array(await pipeline.toBuffer());
  } catch (error) {
    throw new OutputError(
      `Cannot encode atlas page ${width}x${height}: ${(error as Error).message}`,
    );
  }
}
