/**
 * UI contract used by the pipeline and commands.
 * Implementations decide where the bytes go (console, file, buffer in tests).
 */
export interface Logger {
  debug(message: string): void;
  /** Human-readable progress/report lines (stderr, suppressed by `--quiet`). */
  info(message: string): void;
  warn(message: string): void;
  /** Always printed; `hint` is rendered as a second, dimmed line. */
  error(message: string, hint?: string): void;
  /** Machine-readable output (stdout), never suppressed. */
  output(message: string): void;
  /** Single-line progress indicator; `done === total` finishes the line. */
  progress(done: number, total: number, label: string): void;
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  output() {},
  progress() {},
};
