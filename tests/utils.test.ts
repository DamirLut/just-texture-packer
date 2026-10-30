import { describe, expect, test } from "bun:test";
import { expandBraces } from "#core/discover";
import { formatTemplate, normalizeKey, stripExtension } from "#utils/name";
import { stableStringify, sha256 } from "#utils/hash";
import { deepMerge } from "#config/load";
import { pageManifestName } from "#formats/pixi";
import { nextPowerOfTwo } from "#core/pipeline";
import { parseArgs } from "#cli/args";
import { sortBySize } from "#pack/maxrects";

describe("utils", () => {
  test("expandBraces", () => {
    expect(expandBraces("**/*.png")).toEqual(["**/*.png"]);
    expect(expandBraces("**/*.{jpg,png}")).toEqual(["**/*.jpg", "**/*.png"]);
    expect(expandBraces("a/{b,c}/d.{e,f}")).toEqual(["a/b/d.e", "a/b/d.f", "a/c/d.e", "a/c/d.f"]);
  });

  test("formatTemplate supports padding and unknown vars", () => {
    expect(formatTemplate("{name}_{index:03}", { name: "run", index: 7 })).toBe("run_007");
    expect(formatTemplate("{index:02}", { index: 12 })).toBe("12");
    expect(formatTemplate("{missing}/{name}", { name: "x" })).toBe("{missing}/x");
  });

  test("stripExtension and normalizeKey", () => {
    expect(stripExtension("a/b/c.png")).toBe("a/b/c");
    expect(stripExtension("a/b.c/d")).toBe("a/b.c/d");
    expect(stripExtension("noext")).toBe("noext");
    expect(normalizeKey("/a\\b//c/")).toBe("a/b/c");
  });

  test("stableStringify sorts keys", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
  });

  test("sha256 is stable", () => {
    expect(sha256("a", "b")).toBe(sha256("ab"));
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  test("deepMerge merges objects and replaces arrays", () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { c: 3 }, list: [9] })).toEqual({
      a: { b: 1, c: 3 },
      list: [9],
    });
  });

  test("pageManifestName", () => {
    expect(pageManifestName("atlas.json", 0)).toBe("atlas.json");
    expect(pageManifestName("atlas.json", 2)).toBe("atlas-3.json");
    expect(pageManifestName("atlas", 1)).toBe("atlas-2");
  });

  test("nextPowerOfTwo", () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(33)).toBe(64);
    expect(nextPowerOfTwo(1024)).toBe(1024);
  });

  test("sortBySize is deterministic", () => {
    const items = [
      { name: "b", width: 10, height: 10 },
      { name: "a", width: 10, height: 10 },
      { name: "c", width: 20, height: 5 },
    ];
    expect(sortBySize(items, "area-desc").map((item) => item.name)).toEqual(["c", "a", "b"]);
    expect(sortBySize(items, "name").map((item) => item.name)).toEqual(["a", "b", "c"]);
  });
});

describe("cli args", () => {
  test("parses command, positional and flags", () => {
    const parsed = parseArgs(["pack", "./assets", "--out", "dist", "--format", "pixi", "-j", "4"]);
    expect(parsed.command).toBe("pack");
    expect(parsed.positionals).toEqual(["./assets"]);
    expect(parsed.flags.out).toBe("dist");
    expect(parsed.flags.formats).toEqual(["pixi"]);
    expect(parsed.flags.concurrency).toBe(4);
  });

  test("supports negation and =", () => {
    const parsed = parseArgs(["pack", "--no-trim", "--max-size=512x256", "--dry-run"]);
    expect(parsed.flags.crop).toBe(false);
    expect(parsed.flags.maxWidth).toBe(512);
    expect(parsed.flags.maxHeight).toBe(256);
    expect(parsed.flags.dryRun).toBe(true);
  });

  test("boolean flags do not swallow the next argument", () => {
    const parsed = parseArgs(["pack", "./assets", "--dry-run", "-q", "--json", "--clean"]);
    expect(parsed.flags.dryRun).toBe(true);
    expect(parsed.flags.quiet).toBe(true);
    expect(parsed.flags.json).toBe(true);
    expect(parsed.flags.clean).toBe(true);
    expect(parsed.positionals).toEqual(["./assets"]);
  });

  test("defaults to help", () => {
    expect(parseArgs([]).command).toBe("help");
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs(["--version"]).command).toBe("version");
  });

  test("rejects unknown flags", () => {
    expect(() => parseArgs(["pack", "--nope"])).toThrow(/Unknown flag/);
  });
});
