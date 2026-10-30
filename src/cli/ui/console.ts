import { platform, type Writable } from "#platform";
import type { Logger } from "#core/logger";
import { createStyle, type Style } from "./theme";

export interface ConsoleIo {
  readonly stdout: Writable;
  readonly stderr: Writable;
  /** Whether ANSI styling and single-line progress are allowed. */
  readonly isTTY: boolean;
}

/** Console IO backed by the active platform. */
export function platformConsoleIo(): ConsoleIo {
  return { stdout: platform.stdout, stderr: platform.stderr, isTTY: platform.stderrIsTTY };
}

export interface ConsoleLoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * The only place that writes to the console.
 * Everything CLI-facing goes through this class, so output can be redirected,
 * captured in tests or made silent (`--quiet`) in one spot.
 */
export class ConsoleLogger implements Logger {
  readonly style: Style;
  private progressActive = false;
  private readonly verbose: boolean;
  private readonly quiet: boolean;

  constructor(
    private readonly io: ConsoleIo,
    options: ConsoleLoggerOptions = {},
  ) {
    this.style = createStyle(io.isTTY);
    this.verbose = options.verbose ?? false;
    this.quiet = options.quiet ?? false;
  }

  debug(message: string): void {
    if (!this.verbose) return;
    this.clearProgress();
    this.writeErr(`${this.style.dim(`• ${message}`)}\n`);
  }

  info(message: string): void {
    if (this.quiet) return;
    this.clearProgress();
    this.writeErr(message.endsWith("\n") ? message : `${message}\n`);
  }

  warn(message: string): void {
    this.clearProgress();
    this.writeErr(`${this.style.yellow("warning")} ${message}\n`);
  }

  error(message: string, hint?: string): void {
    this.clearProgress();
    this.writeErr(`${this.style.red("error")} ${message}\n`);
    if (hint) this.writeErr(`${this.style.dim(`hint: ${hint}`)}\n`);
  }

  output(message: string): void {
    this.io.stdout.write(message.endsWith("\n") ? message : `${message}\n`);
  }

  progress(done: number, total: number, label: string): void {
    if (!this.io.isTTY || this.quiet) return;
    this.writeErr(`\r${this.style.dim(label)} ${done}/${total}\x1b[K`);
    this.progressActive = done < total;
    if (!this.progressActive) this.writeErr("\n");
  }

  private writeErr(chunk: string): void {
    this.io.stderr.write(chunk);
  }

  private clearProgress(): void {
    if (this.progressActive && this.io.isTTY) {
      this.writeErr("\r\x1b[K");
      this.progressActive = false;
    }
  }
}
