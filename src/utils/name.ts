/**
 * Tiny template formatter.
 * Supports `{var}` and zero-padded `{var:03}` placeholders.
 */
export function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)(?::(0*)(\d+))?\}/g, (match, key: string, _zeros, width) => {
    const value = vars[key];
    if (value === undefined) return match;
    const text = String(value);
    if (!width) return text;
    return text.padStart(Number(width), "0");
  });
}

/** Remove a file extension from the last path segment. */
export function stripExtension(path: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  return dot > slash ? path.slice(0, dot) : path;
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function dirName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

export function extensionOf(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1);
}

/** Normalise a manifest key: POSIX separators, no leading/trailing slashes. */
export function normalizeKey(key: string): string {
  return key
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
}
