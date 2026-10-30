import { resolve } from "node:path";
import { loadConfig } from "#config/load";
import { CheckFailedError } from "#core/errors";
import { runPipeline } from "#core/pipeline";
import type { ParsedCli } from "../args";
import type { ConsoleLogger } from "../ui/console";
import { printReport } from "../ui/summary";

export async function packCommand(parsed: ParsedCli, logger: ConsoleLogger): Promise<void> {
  const { flags } = parsed;
  const rootDir = resolve(parsed.positionals[0] ?? ".");

  const loaded = await loadConfig(rootDir, {
    config: flags.config,
    out: flags.out,
    name: flags.name,
    formats: flags.formats,
    maxWidth: flags.maxWidth,
    maxHeight: flags.maxHeight,
    padding: flags.padding,
    extrude: flags.extrude,
    crop: flags.crop,
    animations: flags.animations,
  });
  if (flags.concurrency !== undefined) loaded.config.concurrency = flags.concurrency;

  const report = await runPipeline(
    {
      rootDir,
      baseDir: loaded.baseDir,
      config: loaded.config,
      configPath: loaded.configPath,
      logger,
    },
    { dryRun: flags.dryRun, check: flags.check, clean: flags.clean },
  );

  printReport(report, logger);
  if (flags.json) logger.output(JSON.stringify(report, null, 2));

  if (report.check && !report.check.ok) {
    throw new CheckFailedError(
      `Generated files are stale (${report.check.differences.length} difference(s))`,
      "Run `jtp pack` to regenerate them.",
    );
  }
}
