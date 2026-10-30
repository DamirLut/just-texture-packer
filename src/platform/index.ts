import { bunPlatform } from "./bun";
import type { Platform } from "./contract";

/**
 * The active platform. Swap this (or pass a custom `Platform`) to run the
 * packer on another runtime without touching the pipeline.
 */
export const platform: Platform = bunPlatform;

export type { FileSystem, GlobMatcher, HashAlgorithm, Platform, Writable } from "./contract";
