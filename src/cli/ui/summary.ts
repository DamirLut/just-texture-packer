import { relative } from "node:path";
import { platform } from "#platform";
import type { PackReport } from "#core/pipeline";
import type { ConsoleLogger } from "./console";

export function printReport(report: PackReport, logger: ConsoleLogger, cwd = platform.cwd()): void {
  const { style } = logger;
  const lines: string[] = [];
  const outDir = relative(cwd, report.outDir) || ".";
  const pagesLabel = report.pages.length === 1 ? "page" : "pages";
  const parts = [
    `${report.pages.length} ${pagesLabel}`,
    `${report.frames} frames`,
    report.sprites > 0 ? `${report.sprites} sprites` : null,
    report.animations > 0 ? `${report.animations} animations` : null,
  ].filter(Boolean);

  lines.push(`${style.green("✓")} ${style.bold(outDir)}: ${parts.join(" · ")}`);

  for (const page of report.pages) {
    lines.push(
      `  ${page.file}  ${page.width}×${page.height}  ${formatBytes(page.bytes)}  ${style.dim(`(${page.frames} frames)`)}`,
    );
  }
  for (const manifest of report.manifests) {
    lines.push(`  ${manifest}`);
  }

  const delta = report.sourceBytes > 0 ? report.atlasBytes / report.sourceBytes : 0;
  const deltaLabel =
    report.sourceBytes > 0
      ? `source ${formatBytes(report.sourceBytes)} → atlas ${formatBytes(report.atlasBytes)} (${delta <= 1 ? "−" : "+"}${Math.abs(Math.round((1 - delta) * 100))}%)`
      : `atlas ${formatBytes(report.atlasBytes)}`;
  lines.push(`  ${style.dim(`${deltaLabel} · ${report.durationMs} ms`)}`);

  if (report.dryRun) lines.push(`  ${style.dim("dry run — no files written")}`);

  if (report.check) {
    if (report.check.ok) {
      lines.push(`  ${style.green("✓")} artifacts are up to date`);
    } else {
      lines.push(`  ${style.red("✗")} artifacts are stale:`);
      for (const difference of report.check.differences) lines.push(`    ${difference}`);
    }
  }

  logger.info(lines.join("\n"));
  // Warnings survive `--quiet` ("only warnings/errors").
  for (const warning of report.warnings) logger.warn(warning);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unitIndex]}`;
}
