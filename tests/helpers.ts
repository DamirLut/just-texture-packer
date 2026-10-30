import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { deepMerge } from "#config/load";
import { ConfigSchema, DEFAULT_CONFIG, type Config } from "#config/schema";

export type Rgba = readonly [number, number, number, number];

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function makeConfig(partial: Record<string, unknown> = {}, baseDir = process.cwd()): Config {
  const merged = deepMerge(structuredClone(DEFAULT_CONFIG as unknown as Record<string, unknown>), {
    output: { dir: baseDir, name: "atlas" },
    ...partial,
  });
  return ConfigSchema.parse(merged);
}

/** Draws `rect` with `color` on a transparent canvas and writes a PNG. */
export async function writePng(path: string, size: Size, rect: Rect, color: Rgba): Promise<void> {
  const data = new Uint8Array(size.w * size.h * 4);
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const offset = (y * size.w + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
    }
  }

  await mkdir(dirname(path), { recursive: true });
  await sharp(Buffer.from(data), { raw: { width: size.w, height: size.h, channels: 4 } })
    .png()
    .toFile(path);
}

export interface GifFrame {
  rect: Rect;
  color: Rgba;
}

/** Writes a multi-frame GIF (each frame is a transparent canvas with one rect). */
export async function writeGif(
  path: string,
  size: Size,
  frames: GifFrame[],
  delay = 80,
): Promise<void> {
  const stack = Buffer.alloc(size.w * size.h * frames.length * 4);
  frames.forEach((frame, index) => {
    for (let y = frame.rect.y; y < frame.rect.y + frame.rect.h; y++) {
      for (let x = frame.rect.x; x < frame.rect.x + frame.rect.w; x++) {
        const row = index * size.h + y;
        const offset = (row * size.w + x) * 4;
        stack[offset] = frame.color[0];
        stack[offset + 1] = frame.color[1];
        stack[offset + 2] = frame.color[2];
        stack[offset + 3] = frame.color[3];
      }
    }
  });

  await mkdir(dirname(path), { recursive: true });
  await sharp(stack, {
    raw: { width: size.w, height: size.h * frames.length, channels: 4, pageHeight: size.h },
  })
    .gif({ delay: frames.map(() => delay), loop: 0 })
    .toFile(path);
}

/** Read an RGBA pixel from an image file. */
export async function readPixel(path: string, x: number, y: number): Promise<Rgba> {
  const { data } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = (await sharp(path).metadata()).width as number;
  const offset = (y * width + x) * 4;
  return [
    data[offset] as number,
    data[offset + 1] as number,
    data[offset + 2] as number,
    data[offset + 3] as number,
  ];
}
