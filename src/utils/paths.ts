import { relative, resolve, sep } from "node:path";

export function toPosixPath(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

/** Relative path with POSIX separators (stable across platforms). */
export function relativePosix(from: string, to: string): string {
  return toPosixPath(relative(from, to));
}

export function resolveFrom(base: string, path: string): string {
  return resolve(base, path);
}

export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep) && !rel.includes(`..${sep}`);
}
