import { PackError } from "#core/errors";
import type { Rect } from "#core/types";

export interface PackItemInput {
  id: string;
  w: number;
  h: number;
}

/**
 * A group of frames that must land on the same page — one animation, or a
 * single standalone sprite.
 */
export interface PackUnit {
  id: string;
  /** Items are tried in the given order; pass them pre-sorted (largest first). */
  items: PackItemInput[];
}

export interface PackSettings {
  maxWidth: number;
  maxHeight: number;
  /** Transparent gap between sprites. */
  padding: number;
  /** Edge replication around each sprite. */
  extrude: number;
  allowRotation: boolean;
  maxPages: number;
}

export interface PackedItem {
  id: string;
  page: number;
  /** Sprite rect (without extrude/padding), rotation already applied. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export interface PackedPage {
  w: number;
  h: number;
}

export interface PackOutcome {
  items: PackedItem[];
  pages: PackedPage[];
}

/**
 * Multi-page MaxRects packing with the BSSF (best short side fit) heuristic.
 *
 * Units (animations) are never split between pages: a unit that does not fit
 * into the remaining space is retried on the next page. Input order is fixed by
 * the caller, which keeps the output deterministic.
 */
export function packUnits(units: readonly PackUnit[], settings: PackSettings): PackOutcome {
  const { maxWidth, maxHeight, padding, extrude, allowRotation, maxPages } = settings;
  const margin = extrude * 2 + padding;

  const bins: MaxRectsBin[] = [];
  const placed: PackedItem[] = [];
  let pending = [...units];

  while (pending.length > 0) {
    if (bins.length >= maxPages) {
      throw new PackError(
        `Content does not fit: page limit of ${maxPages} reached (${pending[0]?.id} and ${pending.length - 1} more)`,
        "Increase atlas.maxPages or atlas.maxWidth/maxHeight.",
      );
    }

    const pageIndex = bins.length;
    const bin = new MaxRectsBin(maxWidth, maxHeight);
    const rest: PackUnit[] = [];

    for (const unit of pending) {
      const snapshot = bin.snapshot();
      const unitPlacements: PackedItem[] = [];
      let fits = true;

      for (const item of unit.items) {
        const slotW = item.w + margin;
        const slotH = item.h + margin;

        const fitsAsIs = slotW <= maxWidth && slotH <= maxHeight;
        const fitsRotated = allowRotation && slotH <= maxWidth && slotW <= maxHeight;
        if (!fitsAsIs && !fitsRotated) {
          throw new PackError(
            `Sprite "${item.id}" (${item.w}x${item.h}) does not fit into ${maxWidth}x${maxHeight}`,
            allowRotation
              ? "Increase atlas.maxWidth/maxHeight."
              : "Increase atlas.maxWidth/maxHeight or enable atlas.allowRotation.",
          );
        }

        const slot = bin.insert(slotW, slotH, allowRotation);
        if (!slot) {
          fits = false;
          break;
        }

        unitPlacements.push({
          id: item.id,
          page: pageIndex,
          x: slot.x + extrude,
          y: slot.y + extrude,
          w: slot.rotated ? item.h : item.w,
          h: slot.rotated ? item.w : item.h,
          rotated: slot.rotated,
        });
      }

      if (!fits) {
        bin.restore(snapshot);
        rest.push(unit);
        continue;
      }
      placed.push(...unitPlacements);
    }

    if (bin.placedCount === 0) {
      const unit = pending[0] as PackUnit;
      const label = unit.id.replace(/^(?:animation|sprite):/, "");
      if (unit.items.length > 1) {
        throw new PackError(
          `Animation "${label}" (${unit.items.length} frames) does not fit onto a single page`,
          "Increase atlas.maxWidth/maxHeight, or set animations.auto = false.",
        );
      }
      throw new PackError(
        `Cannot place "${label}" on an empty page`,
        "Check atlas.maxWidth/maxHeight and atlas.padding.",
      );
    }

    bins.push(bin);
    pending = rest;
  }

  const pages: PackedPage[] = bins.map((_, pageIndex) => {
    const pageItems = placed.filter((item) => item.page === pageIndex);
    const w = Math.max(1, ...pageItems.map((item) => item.x + item.w + extrude));
    const h = Math.max(1, ...pageItems.map((item) => item.y + item.h + extrude));
    return { w, h };
  });

  return { items: placed, pages };
}

/** Convenience wrapper: every item is its own unit. */
export function packItems(items: readonly PackItemInput[], settings: PackSettings): PackOutcome {
  return packUnits(
    items.map((item) => ({ id: item.id, items: [item] })),
    settings,
  );
}

/** Classic MaxRects bin with free-rectangle splitting and pruning. */
export class MaxRectsBin {
  private free: Rect[] = [];
  placedCount = 0;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.free.push({ x: 0, y: 0, w: width, h: height });
  }

  snapshot(): { free: Rect[]; placedCount: number } {
    return { free: this.free.map((rect) => ({ ...rect })), placedCount: this.placedCount };
  }

  restore(snapshot: { free: Rect[]; placedCount: number }): void {
    this.free = snapshot.free.map((rect) => ({ ...rect }));
    this.placedCount = snapshot.placedCount;
  }

  insert(
    slotW: number,
    slotH: number,
    allowRotation: boolean,
  ): { x: number; y: number; rotated: boolean } | null {
    const best = this.findBest(slotW, slotH, allowRotation);
    if (!best) return null;

    const used: Rect = { x: best.x, y: best.y, w: best.w, h: best.h };
    this.free = this.splitFree(used);
    this.prune();
    this.placedCount++;
    return { x: used.x, y: used.y, rotated: best.rotated };
  }

  private findBest(
    slotW: number,
    slotH: number,
    allowRotation: boolean,
  ): {
    x: number;
    y: number;
    w: number;
    h: number;
    rotated: boolean;
    short: number;
    long: number;
  } | null {
    let best: {
      x: number;
      y: number;
      w: number;
      h: number;
      rotated: boolean;
      short: number;
      long: number;
    } | null = null;

    const consider = (rect: Rect, w: number, h: number, rotated: boolean): void => {
      if (rect.w < w || rect.h < h) return;
      const leftoverW = rect.w - w;
      const leftoverH = rect.h - h;
      const short = Math.min(leftoverW, leftoverH);
      const long = Math.max(leftoverW, leftoverH);
      const better =
        !best ||
        short < best.short ||
        (short === best.short && long < best.long) ||
        (short === best.short && long === best.long && best.rotated && !rotated);
      if (better) {
        best = { x: rect.x, y: rect.y, w, h, rotated, short, long };
      }
    };

    for (const rect of this.free) {
      consider(rect, slotW, slotH, false);
      if (allowRotation && slotW !== slotH) consider(rect, slotH, slotW, true);
    }

    return best;
  }

  private splitFree(used: Rect): Rect[] {
    const next: Rect[] = [];
    const usedRight = used.x + used.w;
    const usedBottom = used.y + used.h;

    for (const rect of this.free) {
      if (!intersects(rect, used)) {
        next.push(rect);
        continue;
      }

      if (rect.x < used.x) {
        next.push({ x: rect.x, y: rect.y, w: used.x - rect.x, h: rect.h });
      }
      const rectRight = rect.x + rect.w;
      if (rectRight > usedRight) {
        next.push({ x: usedRight, y: rect.y, w: rectRight - usedRight, h: rect.h });
      }
      if (rect.y < used.y) {
        next.push({ x: rect.x, y: rect.y, w: rect.w, h: used.y - rect.y });
      }
      const rectBottom = rect.y + rect.h;
      if (rectBottom > usedBottom) {
        next.push({ x: rect.x, y: usedBottom, w: rect.w, h: rectBottom - usedBottom });
      }
    }

    return next.filter((rect) => rect.w > 0 && rect.h > 0);
  }

  /** Drop free rects fully contained in another free rect. */
  private prune(): void {
    const keep: Rect[] = [];
    for (let i = 0; i < this.free.length; i++) {
      const a = this.free[i] as Rect;
      let redundant = false;
      for (let j = 0; j < this.free.length; j++) {
        if (i === j) continue;
        const b = this.free[j] as Rect;
        if (contains(b, a) && !(contains(a, b) && j > i)) {
          redundant = true;
          break;
        }
      }
      if (!redundant) keep.push(a);
    }
    this.free = keep;
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export type SortMode = "area-desc" | "height-desc" | "width-desc" | "name";

export function sortBySize<T extends { name: string; width: number; height: number }>(
  items: readonly T[],
  mode: SortMode,
): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    let diff = 0;
    switch (mode) {
      case "area-desc":
        diff = b.width * b.height - a.width * a.height;
        if (diff === 0) diff = Math.max(b.width, b.height) - Math.max(a.width, a.height);
        break;
      case "height-desc":
        diff = b.height - a.height;
        if (diff === 0) diff = b.width - a.width;
        break;
      case "width-desc":
        diff = b.width - a.width;
        if (diff === 0) diff = b.height - a.height;
        break;
      case "name":
        diff = 0;
        break;
    }
    if (diff !== 0) return diff;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return sorted;
}
