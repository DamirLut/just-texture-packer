import { describe, expect, test } from "bun:test";
import { sortBySize, packItems, packUnits, type PackSettings } from "#pack/maxrects";
import { PackError } from "#core/errors";

const settings: PackSettings = {
  maxWidth: 128,
  maxHeight: 128,
  padding: 2,
  extrude: 1,
  allowRotation: false,
  maxPages: 8,
};

function randomItems(count: number, seed = 1) {
  let state = seed;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    w: 4 + Math.floor(rand() * 30),
    h: 4 + Math.floor(rand() * 30),
  }));
}

describe("maxrects packing", () => {
  test("keeps every rect inside its page and never overlaps", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const items = sortBySize(
        randomItems(40, seed).map((item) => ({
          ...item,
          name: item.id,
          width: item.w,
          height: item.h,
        })),
        "area-desc",
      );
      const result = packItems(items, settings);

      for (const item of result.items) {
        const page = result.pages[item.page];
        expect(page).toBeDefined();
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.y).toBeGreaterThanOrEqual(0);
        expect(item.x + item.w + settings.extrude).toBeLessThanOrEqual(
          (page as { w: number }).w + settings.padding,
        );
        expect(item.y + item.h + settings.extrude).toBeLessThanOrEqual(
          (page as { h: number }).h + settings.padding,
        );
      }

      for (let i = 0; i < result.items.length; i++) {
        for (let j = i + 1; j < result.items.length; j++) {
          const a = result.items[i] as (typeof result.items)[number];
          const b = result.items[j] as (typeof result.items)[number];
          if (a.page !== b.page) continue;
          const overlap =
            a.x < b.x + b.w + settings.padding &&
            a.x + a.w + settings.padding > b.x &&
            a.y < b.y + b.h + settings.padding &&
            a.y + a.h + settings.padding > b.y;
          expect(overlap).toBe(false);
        }
      }
    }
  });

  test("is deterministic", () => {
    const items = randomItems(30, 7);
    const first = packItems(items, settings);
    const second = packItems(items, settings);
    expect(second).toEqual(first);
  });

  test("opens additional pages when needed", () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      id: `big-${index}`,
      w: 60,
      h: 60,
    }));
    const result = packItems(items, settings);
    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.items).toHaveLength(20);
  });

  test("never splits a unit (animation) between pages", () => {
    const units = [
      {
        id: "a",
        items: Array.from({ length: 3 }, (_, index) => ({ id: `a-${index}`, w: 20, h: 20 })),
      },
      {
        id: "b",
        items: Array.from({ length: 3 }, (_, index) => ({ id: `b-${index}`, w: 20, h: 20 })),
      },
    ];
    // a 64x64 page holds exactly 4 slots of 24x24, so unit b has to move.
    const result = packUnits(units, { ...settings, maxWidth: 64, maxHeight: 64 });
    const pageOf = new Map(result.items.map((item) => [item.id, item.page]));
    const pagesOfA = new Set(units[0]!.items.map((item) => pageOf.get(item.id)));
    const pagesOfB = new Set(units[1]!.items.map((item) => pageOf.get(item.id)));
    expect(pagesOfA.size).toBe(1);
    expect(pagesOfB.size).toBe(1);
  });

  test("rejects sprites larger than a page", () => {
    expect(() => packItems([{ id: "huge", w: 500, h: 20 }], settings)).toThrow(PackError);
  });

  test("respects the page limit", () => {
    const items = Array.from({ length: 10 }, (_, index) => ({ id: `x-${index}`, w: 60, h: 60 }));
    expect(() => packItems(items, { ...settings, maxPages: 1 })).toThrow(PackError);
  });

  test("rotation only used when allowed", () => {
    const items = [{ id: "wide", w: 100, h: 20 }];
    const noRotation = packItems(items, { ...settings, maxWidth: 128, maxHeight: 64 });
    expect(noRotation.items[0]?.rotated).toBe(false);
    expect(noRotation.items[0]?.w).toBe(100);
    const withRotation = packItems(items, {
      ...settings,
      maxWidth: 32,
      maxHeight: 128,
      allowRotation: true,
    });
    expect(withRotation.items[0]?.rotated).toBe(true);
    expect(withRotation.items[0]?.w).toBe(20);
    expect(withRotation.items[0]?.h).toBe(100);
  });
});
