import type { AtlasResult, ManifestFile } from "#core/types";
import type { ZodType } from "zod";

export interface ManifestContext {
  /** Base atlas name from `output.name`, e.g. `atlas`. */
  baseName: string;
  /** Output directory (absolute), for reference in messages. */
  outputDir: string;
}

/**
 * A format adapter converts the format-neutral atlas description into
 * manifest file(s). Adapters never touch pixels or the filesystem.
 */
export interface ManifestAdapter<Options = unknown> {
  readonly id: string;
  readonly extension: string;
  readonly optionsSchema: ZodType<Options>;
  build(result: AtlasResult, options: Options, context: ManifestContext): ManifestFile[];
}
