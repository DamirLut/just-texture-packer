import { describe, expect, test } from "bun:test";
import { alphaBBox, cropFrames } from "#image/trim";
import { composePage, rotateCW } from "#image/compose";
import type { RawFrame } from "#core/types";
import type { CropOptions } from "#config/schema";

function frame(width: number, height: number, fill?: (x: number, y: number) => number): RawFrame {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = fill ? fill(x, y) : 255;
      const offset = (y * width + x) * 4;
      data[offset] = x % 256;
      data[offset + 1] = y % 256;
      data[offset + 2] = 7;
      data[offset + 3] = alpha;
    }
  }
  return { width, height, data, duration: 0 };
}

const cropAuto: CropOptions = { mode: "auto", threshold: 1, animations: "union" };

describe("alphaBBox", () => {
  test("finds the opaque rect", () => {
    const source = frame(10, 10, (x, y) => (x >= 2 && x <= 5 && y >= 3 && y <= 8 ? 255 : 0));
    expect(alphaBBox(source.data, 10, 10, 1)).toEqual({ x: 2, y: 3, w: 4, h: 6 });
  });

  test("returns null for a fully transparent frame", () => {
    const source = frame(4, 4, () => 0);
    expect(alphaBBox(source.data, 4, 4, 1)).toBeNull();
  });
});

describe("cropFrames", () => {
  test("crops static frames tightly and records offsets", () => {
    const source = frame(10, 10, (x, y) => (x >= 2 && x <= 5 && y >= 3 && y <= 8 ? 255 : 0));
    const [cropped] = cropFrames([source], cropAuto, false);
    expect(cropped).toMatchObject({
      width: 4,
      height: 6,
      offsetX: 2,
      offsetY: 3,
      sourceWidth: 10,
      sourceHeight: 10,
      trimmed: true,
    });
    expect(cropped?.data.byteLength).toBe(4 * 6 * 4);
  });

  test("union mode keeps all animation frames aligned", () => {
    const a = frame(10, 10, (x, y) => (x >= 2 && x <= 5 && y >= 3 && y <= 8 ? 255 : 0));
    const b = frame(10, 10, (x, y) => (x >= 0 && x <= 3 && y >= 0 && y <= 3 ? 255 : 0));
    const cropped = cropFrames([a, b], cropAuto, true);
    expect(cropped[0]).toMatchObject({ width: 6, height: 9, offsetX: 0, offsetY: 0 });
    expect(cropped[1]).toMatchObject({ width: 6, height: 9, offsetX: 0, offsetY: 0 });
  });

  test("per-frame mode crops every frame independently", () => {
    const a = frame(10, 10, (x, y) => (x >= 2 && x <= 5 && y >= 3 && y <= 8 ? 255 : 0));
    const b = frame(10, 10, (x, y) => (x >= 0 && x <= 3 && y >= 0 && y <= 3 ? 255 : 0));
    const cropped = cropFrames([a, b], { ...cropAuto, animations: "per-frame" }, true);
    expect(cropped[0]).toMatchObject({ width: 4, height: 6, offsetX: 2, offsetY: 3 });
    expect(cropped[1]).toMatchObject({ width: 4, height: 4, offsetX: 0, offsetY: 0 });
  });

  test("mode none keeps the original frame", () => {
    const source = frame(10, 10, () => 0);
    const [cropped] = cropFrames([source], { ...cropAuto, mode: "none" }, false);
    expect(cropped).toMatchObject({
      width: 10,
      height: 10,
      trimmed: false,
      offsetX: 0,
      offsetY: 0,
    });
  });
});

describe("compose", () => {
  test("rotateCW maps pixel (x, y) to (h - 1 - y, x)", () => {
    const src = new Uint8Array([
      1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255,
    ]); // 3x2
    const rotated = rotateCW(src, 3, 2); // 2x3
    const pixel = (x: number, y: number) => rotated[(y * 2 + x) * 4];
    expect(pixel(0, 0)).toBe(4);
    expect(pixel(1, 0)).toBe(1);
    expect(pixel(0, 1)).toBe(5);
    expect(pixel(1, 1)).toBe(2);
    expect(pixel(0, 2)).toBe(6);
    expect(pixel(1, 2)).toBe(3);
  });

  test("rotated frames match Pixi's rotate=2 sampling convention", () => {
    // 2x3 sprite, every pixel a unique red value.
    const width = 2;
    const height = 3;
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = i + 1;
      data[i * 4 + 3] = 255;
    }
    const sprite: RawFrame = { width, height, data, duration: 0 };
    const page = composePage(
      8,
      8,
      [
        {
          frame: {
            ...sprite,
            name: "r",
            index: 0,
            animation: null,
            duration: 0,
            source: "r",
            trimmed: false,
            offsetX: 0,
            offsetY: 0,
            sourceWidth: width,
            sourceHeight: height,
          },
          page: 0,
          rect: { x: 1, y: 1, w: height, h: width },
          rotated: true,
        },
      ],
      0,
    );

    // Pixi maps sprite pixel (sx, sy) of a rotated frame to
    // atlas (x + h - 1 - sy, y + sx) (rotate = 2 -> 90° CW).
    for (let sy = 0; sy < height; sy++) {
      for (let sx = 0; sx < width; sx++) {
        const ax = 1 + height - 1 - sy;
        const ay = 1 + sx;
        expect(page[(ay * 8 + ax) * 4]).toBe(sy * width + sx + 1);
      }
    }
  });

  test("blits sprites and extrudes their edges", () => {
    const sprite = frame(2, 2, () => 255);
    const page = composePage(
      8,
      8,
      [
        {
          frame: {
            ...sprite,
            name: "a",
            index: 0,
            animation: null,
            duration: 0,
            source: "a",
            trimmed: false,
            offsetX: 0,
            offsetY: 0,
            sourceWidth: 2,
            sourceHeight: 2,
          },
          page: 0,
          rect: { x: 3, y: 3, w: 2, h: 2 },
          rotated: false,
        },
      ],
      1,
    );
    const alpha = (x: number, y: number) => page[(y * 8 + x) * 4 + 3];
    expect(alpha(3, 3)).toBe(255);
    expect(alpha(4, 4)).toBe(255);
    expect(alpha(2, 3)).toBe(255);
    expect(alpha(5, 4)).toBe(255);
    expect(alpha(3, 2)).toBe(255);
    expect(alpha(4, 5)).toBe(255);
    expect(alpha(2, 2)).toBe(255);
    expect(alpha(1, 3)).toBe(0);
  });
});
