import { ConfigError } from "#core/errors";
import type { ManifestAdapter } from "./types";

const adapters = new Map<string, ManifestAdapter<unknown>>();

export function registerAdapter<T>(adapter: ManifestAdapter<T>): void {
  adapters.set(adapter.id, adapter as unknown as ManifestAdapter<unknown>);
}

export function getAdapter(id: string): ManifestAdapter<unknown> {
  const adapter = adapters.get(id);
  if (!adapter) {
    const available = [...adapters.keys()].sort().join(", ") || "<none>";
    throw new ConfigError(`Unknown manifest format "${id}"`, `Available formats: ${available}`);
  }
  return adapter;
}

export function listAdapters(): string[] {
  return [...adapters.keys()].sort();
}
