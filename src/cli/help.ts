import type { Style } from "./ui/theme";
import { listAdapters } from "#formats";

export function helpText(style: Style): string {
  return `${style.bold("just-texture-packer")} — pack images into an optimized atlas + manifests

${style.bold("Usage")}
  jtp pack [dir] [options]
  jtp init [dir] [--json] [--force]
  jtp help
  jtp --version

${style.bold("Commands")}
  pack    scan <dir>, pack an atlas and write manifests (config: packer.config.* in <dir>)
  init    write a starter config into <dir>

${style.bold("Options")}
  -c, --config <file>   config path (default: auto-discovered in <dir>)
  -o, --out <dir>       output directory (overrides config)
      --name <base>     atlas base name, e.g. atlas -> atlas.png / atlas.json
  -f, --format <ids>    manifest formats, comma separated (available: ${listAdapters().join(", ")})
      --max-size <WxH>  max page size, e.g. 2048x2048
      --padding <n>     transparent gap between sprites
      --extrude <n>     edge replication around sprites
      --no-trim         keep transparent borders (disable cropping)
      --no-animations   disable animation auto-detection
  -j, --jobs <n>        parallel decode/encode jobs
      --dry-run         compute everything, write nothing
      --check           exit code 3 when generated files are stale
      --clean           delete pages left over from a previous run
      --json            print the machine-readable report to stdout
  -v, --verbose         verbose logs
  -q, --quiet           only warnings/errors
  -h, --help            show this help
  -V, --version         print version

${style.bold("Examples")}
  jtp pack ./assets
  jtp pack ./assets --out ../client/public/sprites --dry-run
  jtp pack ./assets --check
  jtp init ./assets
`;
}
