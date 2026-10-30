import { z } from "zod";
import type { AtlasResult, ManifestFile } from "#core/types";
import type { ManifestAdapter, ManifestContext } from "./types";

const PixiOptionsSchema = z
  .object({
    /** Manifest file name for the first page; other pages get `-2`, `-3`… */
    file: z.string().min(1).default("atlas.json"),
    /** PixiJS major version written into `meta.version`. */
    version: z.number().int().min(5).default(8),
    /** Write the `animations` map. */
    includeAnimations: z.boolean().default(true),
    /** Add durations/fps to `meta.animations` (extra, ignored by Pixi). */
    includeAnimationMeta: z.boolean().default(true),
    /** Base app name written into `meta.app`. */
    app: z.string().default("just-texture-packer"),
  })
  .catchall(z.unknown());

export type PixiOptions = z.infer<typeof PixiOptionsSchema>;

export const PIXI_APP_VERSION = "1.0.0";

export const pixiAdapter: ManifestAdapter<PixiOptions> = {
  id: "pixi",
  extension: ".json",
  optionsSchema: PixiOptionsSchema,
  build(result: AtlasResult, options: PixiOptions, context: ManifestContext): ManifestFile[] {
    const manifestFiles = result.pages.map((_, index) => pageManifestName(options.file, index));

    return result.pages.map((page, pageIndex) => {
      const frames: Record<string, unknown> = {};

      for (const entry of result.frames) {
        if (entry.page !== pageIndex) continue;
        frames[entry.name] = {
          frame: { x: entry.frame.x, y: entry.frame.y, w: entry.frame.w, h: entry.frame.h },
          rotated: entry.rotated,
          trimmed: entry.trimmed,
          spriteSourceSize: {
            x: entry.sourceOffset.x,
            y: entry.sourceOffset.y,
            w: entry.frame.w,
            h: entry.frame.h,
          },
          sourceSize: { w: entry.sourceSize.w, h: entry.sourceSize.h },
        };
      }

      const related = manifestFiles.filter((_, index) => index !== pageIndex);
      const meta: Record<string, unknown> = {
        app: options.app,
        version: String(options.version),
        image: page.file,
        format: "RGBA8888",
        size: { w: page.width, h: page.height },
        scale: String(result.scale),
        hash: result.hash,
        generated: result.generated,
      };
      if (related.length > 0) meta.related_multi_packs = related;

      const manifest: Record<string, unknown> = {
        frames,
        meta,
      };

      if (options.includeAnimations && result.animations.length > 0) {
        manifest.animations = Object.fromEntries(
          result.animations.map((animation) => [animation.name, animation.frames]),
        );
        if (options.includeAnimationMeta) {
          meta.animations = Object.fromEntries(
            result.animations.map((animation) => [
              animation.name,
              { frames: animation.frames.length, duration: animation.duration, fps: animation.fps },
            ]),
          );
        }
      }

      void context;
      return {
        file: manifestFiles[pageIndex] as string,
        contents: `${JSON.stringify(manifest, null, 2)}\n`,
      };
    });
  },
};

/** `atlas.json` + index 1 -> `atlas-2.json`. */
export function pageManifestName(base: string, index: number): string {
  if (index === 0) return base;
  const dot = base.lastIndexOf(".");
  const suffix = `-${index + 1}`;
  return dot === -1 ? `${base}${suffix}` : `${base.slice(0, dot)}${suffix}${base.slice(dot)}`;
}
