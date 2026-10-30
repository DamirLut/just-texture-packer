#!/usr/bin/env bun
import { platform } from "#platform";
import { runCli } from "./run";

function userArgs(argv: readonly string[]): string[] {
  const second = argv[1] ?? "";
  // `bun src/cli/index.ts ...` -> [bun, script, ...args]
  // compiled/standalone       -> [exe, ...args]
  const isScript = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(second);
  return argv.slice(isScript ? 2 : 1);
}

await runCli(userArgs(platform.argv));
