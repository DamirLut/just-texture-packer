import { registerAdapter } from "./registry";
import { pixiAdapter } from "./pixi";

// Side-effect module: importing the formats barrel registers all adapters.
registerAdapter(pixiAdapter);

export { getAdapter, listAdapters, registerAdapter } from "./registry";
export type { ManifestAdapter, ManifestContext } from "./types";
