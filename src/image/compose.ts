import type { PlacedFrame, Rect } from "#core/types";

/** Rotate RGBA data 90° clockwise. */
export function rotateCW(data: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(data.length);
  const dstWidth = height;
  // dst(X, Y) = src(X_src = Y, Y_src = height - 1 - X)
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < height; x++) {
      const src = ((height - 1 - x) * width + y) * 4;
      const dst = (y * dstWidth + x) * 4;
      out[dst] = data[src] as number;
      out[dst + 1] = data[src + 1] as number;
      out[dst + 2] = data[src + 2] as number;
      out[dst + 3] = data[src + 3] as number;
    }
  }
  return out;
}

/**
 * Draw all placed frames into one RGBA page buffer and replicate edge pixels
 * (`extrude`) so sampling never bleeds into neighbouring sprites.
 */
export function composePage(
  width: number,
  height: number,
  placed: PlacedFrame[],
  extrude: number,
): Uint8Array {
  const page = new Uint8Array(width * height * 4);

  for (const item of placed) {
    const { frame, rect, rotated } = item;
    const data = rotated ? rotateCW(frame.data, frame.width, frame.height) : frame.data;
    blit(page, width, height, data, rect);
  }

  if (extrude > 0) {
    for (const item of placed) {
      extrudeRect(page, width, height, item.rect, extrude);
    }
  }

  return page;
}

function blit(
  page: Uint8Array,
  pageWidth: number,
  pageHeight: number,
  data: Uint8Array,
  rect: Rect,
): void {
  const rowBytes = rect.w * 4;
  for (let y = 0; y < rect.h; y++) {
    const dy = rect.y + y;
    if (dy < 0 || dy >= pageHeight) continue;
    const srcStart = y * rowBytes;
    const dstStart = (dy * pageWidth + rect.x) * 4;
    page.set(data.subarray(srcStart, srcStart + rowBytes), dstStart);
  }
}

/** Fill the border around `rect` with the closest edge pixels (clamped). */
function extrudeRect(
  page: Uint8Array,
  pageWidth: number,
  pageHeight: number,
  rect: Rect,
  extrude: number,
): void {
  const left = Math.max(0, rect.x - extrude);
  const right = Math.min(pageWidth, rect.x + rect.w + extrude);
  const top = Math.max(0, rect.y - extrude);
  const bottom = Math.min(pageHeight, rect.y + rect.h + extrude);

  // Horizontal pass: extends the top/bottom rows across the full (already
  // extruded) width, so the following vertical pass also fixes the corners.
  for (let d = 1; d <= extrude; d++) {
    const above = rect.y - d;
    if (above >= top) copyRow(page, pageWidth, rect.y, above, left, right);
    const below = rect.y + rect.h - 1 + d;
    if (below < bottom) copyRow(page, pageWidth, rect.y + rect.h - 1, below, left, right);
  }

  // Vertical pass.
  for (let d = 1; d <= extrude; d++) {
    const leftCol = rect.x - d;
    if (leftCol >= left) copyColumn(page, pageWidth, rect.x, leftCol, top, bottom);
    const rightCol = rect.x + rect.w - 1 + d;
    if (rightCol < right) copyColumn(page, pageWidth, rect.x + rect.w - 1, rightCol, top, bottom);
  }
}

function copyRow(
  page: Uint8Array,
  pageWidth: number,
  srcRow: number,
  dstRow: number,
  fromX: number,
  toX: number,
): void {
  const srcStart = (srcRow * pageWidth + fromX) * 4;
  const dstStart = (dstRow * pageWidth + fromX) * 4;
  page.copyWithin(dstStart, srcStart, srcStart + (toX - fromX) * 4);
}

function copyColumn(
  page: Uint8Array,
  pageWidth: number,
  srcCol: number,
  dstCol: number,
  fromY: number,
  toY: number,
): void {
  for (let y = fromY; y < toY; y++) {
    const src = (y * pageWidth + srcCol) * 4;
    const dst = (y * pageWidth + dstCol) * 4;
    page[dst] = page[src] as number;
    page[dst + 1] = page[src + 1] as number;
    page[dst + 2] = page[src + 2] as number;
    page[dst + 3] = page[src + 3] as number;
  }
}
