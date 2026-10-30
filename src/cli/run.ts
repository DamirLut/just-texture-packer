import { platform } from "#platform";
import { JtpError } from "#core/errors";
import { PACKER_VERSION } from "#core/version";
import { parseArgs } from "./args";
import { initCommand } from "./commands/init";
import { packCommand } from "./commands/pack";
import { helpText } from "./help";
import { ConsoleLogger, platformConsoleIo } from "./ui/console";

export async function runCli(argv: string[]): Promise<void> {
  // A logger is needed before flags are known (parse errors).
  let logger = new ConsoleLogger(platformConsoleIo());
  let verbose = false;

  try {
    const parsed = parseArgs(argv);
    verbose = parsed.flags.verbose;
    logger = new ConsoleLogger(platformConsoleIo(), {
      verbose: parsed.flags.verbose,
      quiet: parsed.flags.quiet,
    });

    switch (parsed.command) {
      case "pack":
        await packCommand(parsed, logger);
        break;
      case "init":
        await initCommand(parsed, logger);
        break;
      case "version":
        logger.output(PACKER_VERSION);
        break;
      case "help":
        logger.output(helpText(logger.style));
        break;
      default:
        logger.error(`unknown command "${parsed.command}"`);
        logger.output(helpText(logger.style));
        platform.setExitCode(1);
    }
  } catch (error) {
    if (error instanceof JtpError) {
      logger.error(error.message, error.hint);
      if (verbose && error.stack) logger.debug(error.stack);
      platform.setExitCode(error.exitCode);
      return;
    }

    logger.error((error as Error).message);
    if (verbose && (error as Error).stack) logger.debug((error as Error).stack as string);
    platform.setExitCode(1);
  }
}
