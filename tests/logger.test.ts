import { describe, expect, test } from "bun:test";
import { ConsoleLogger, type ConsoleIo } from "#cli/ui/console";
import { silentLogger } from "#core/logger";

function fakeIo(isTTY = false) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: ConsoleIo = {
    stdout: {
      write(chunk) {
        stdout.push(chunk);
        return true;
      },
    },
    stderr: {
      write(chunk) {
        stderr.push(chunk);
        return true;
      },
    },
    isTTY,
  };
  return { io, out: () => stdout.join(""), err: () => stderr.join("") };
}

describe("ConsoleLogger", () => {
  test("info and warnings go to stderr", () => {
    const { io, out, err } = fakeIo();
    const logger = new ConsoleLogger(io);
    logger.info("packed");
    logger.warn("careful");
    expect(out()).toBe("");
    expect(err()).toContain("packed\n");
    expect(err()).toContain("careful\n");
  });

  test("output goes to stdout exactly once with a trailing newline", () => {
    const { io, out, err } = fakeIo();
    const logger = new ConsoleLogger(io);
    logger.output('{"a":1}');
    logger.output("done\n");
    expect(out()).toBe('{"a":1}\ndone\n');
    expect(err()).toBe("");
  });

  test("--quiet suppresses info but keeps warnings, errors and stdout", () => {
    const { io, out, err } = fakeIo();
    const logger = new ConsoleLogger(io, { quiet: true });
    logger.info("hidden");
    logger.warn("warning");
    logger.error("boom", "try again");
    logger.output("json");
    expect(err()).not.toContain("hidden");
    expect(err()).toContain("warning");
    expect(err()).toContain("error boom");
    expect(err()).toContain("hint: try again");
    expect(out()).toBe("json\n");
  });

  test("verbose enables debug", () => {
    const quiet = fakeIo();
    new ConsoleLogger(quiet.io).debug("nope");
    expect(quiet.err()).toBe("");

    const { io, err } = fakeIo();
    const verbose = new ConsoleLogger(io, { verbose: true });
    verbose.debug("hello");
    expect(err()).toContain("hello");
  });

  test("progress is only drawn on a TTY", () => {
    const plain = fakeIo(false);
    new ConsoleLogger(plain.io).progress(1, 2, "decoding");
    expect(plain.err()).toBe("");

    const tty = fakeIo(true);
    const logger = new ConsoleLogger(tty.io);
    logger.progress(1, 2, "decoding");
    logger.progress(2, 2, "decoding");
    expect(tty.err()).toContain("1/2");
    expect(tty.err()).toContain("2/2");
    expect(tty.err().endsWith("\n")).toBe(true);
  });

  test("colors depend on TTY and are disabled for piped output", () => {
    const plain = new ConsoleLogger(fakeIo(false).io);
    expect(plain.style.green("ok")).toBe("ok");

    const colored = new ConsoleLogger(fakeIo(true).io);
    expect(colored.style.green("ok")).toBe("\x1b[32mok\x1b[0m");
  });

  test("silentLogger swallows everything", () => {
    expect(() => {
      silentLogger.debug("a");
      silentLogger.info("a");
      silentLogger.warn("a");
      silentLogger.error("a", "b");
      silentLogger.output("a");
      silentLogger.progress(1, 1, "a");
    }).not.toThrow();
  });
});
