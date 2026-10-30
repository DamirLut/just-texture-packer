import type { RawFrame, Rect, TrimmedFrame } from "#core/types";
import type { CropOptions } from "#config/schema";

/** Bounding box of pixels whose alpha is above `threshold`. */
export function alphaBBox(
  data: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const alpha = data[rowStart + x * 4 + 3] as number;
      if (alpha > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Crop frames of one source.
 * Animations can share a single crop rect (`union`) so frames stay aligned.
 */
export function cropFrames(
  frames: RawFrame[],
  crop: CropOptions,
  isAnimation: boolean,
): TrimmedFrame[] {
  if (crop.mode === "none") {
    return frames.map((frame) => fullFrame(frame));
  }

  const boxes = frames.map((frame) =>
    alphaBBox(frame.data, frame.width, frame.height, crop.threshold),
  );

  if (isAnimation && crop.animations === "union") {
    const union = unionRect(boxes);
    return frames.map((frame) => (union ? cropFrame(frame, union) : fullFrame(frame)));
  }

  return frames.map((frame, index) => {
    const box = boxes[index];
    return box ? cropFrame(frame, box) : fullFrame(frame);
  });
}

export function cropFrame(frame: RawFrame, box: Rect): TrimmedFrame {
  const { width, height, data } = frame;
  const out = new Uint8Array(box.w * box.h * 4);
  const rowBytes = box.w * 4;

  for (let y = 0; y < box.h; y++) {
    const srcStart = ((box.y + y) * width + box.x) * 4;
    out.set(data.subarray(srcStart, srcStart + rowBytes), y * rowBytes);
  }

  return {
    data: out,
    width: box.w,
    height: box.h,
    offsetX: box.x,
    offsetY: box.y,
    sourceWidth: width,
    sourceHeight: height,
    trimmed: box.x !== 0 || box.y !== 0 || box.w !== width || box.h !== height,
  };
}

function fullFrame(frame: RawFrame): TrimmedFrame {
  return {
    data: new Uint8Array(frame.data),
    width: frame.width,
    height: frame.height,
    offsetX: 0,
    offsetY: 0,
    sourceWidth: frame.width,
    sourceHeight: frame.height,
    trimmed: false,
  };
}

function unionRect(rects: (Rect | null)[]): Rect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const rect of rects) {
    if (!rect) continue;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }

  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
