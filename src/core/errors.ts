/** Base error carrying a process exit code and an optional hint for the user. */
export class JtpError extends Error {
  readonly exitCode: number;
  readonly hint?: string;

  constructor(message: string, exitCode = 1, hint?: string) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

/** Invalid or missing configuration. */
export class ConfigError extends JtpError {
  constructor(message: string, hint?: string) {
    super(message, 1, hint);
  }
}

/** Image could not be read/decoded. */
export class ImageError extends JtpError {
  constructor(message: string, hint?: string) {
    super(message, 2, hint);
  }
}

/** Sprites do not fit into the atlas constraints. */
export class PackError extends JtpError {
  constructor(message: string, hint?: string) {
    super(message, 2, hint);
  }
}

/** Files could not be written. */
export class OutputError extends JtpError {
  constructor(message: string, hint?: string) {
    super(message, 2, hint);
  }
}

/** `--check` found stale artifacts. */
export class CheckFailedError extends JtpError {
  constructor(message: string, hint?: string) {
    super(message, 3, hint);
  }
}
