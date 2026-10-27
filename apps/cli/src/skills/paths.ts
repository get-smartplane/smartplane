import { Schema } from "effect"

/** Folder names are slugs; anything else (separators, dots) is refused rather than written. */
export const isSafeSlug = (slug: string): boolean => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)

/**
 * A relative path inside a skill folder. Defence in depth against a compromised or buggy server: no absolute
 * paths, drive letters, backslashes, `.`/`..` segments or empty segments.
 */
export const isSafePath = (path: string): boolean =>
  path.length > 0 &&
  path.length <= 512 &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  !/^[A-Za-z]:/.test(path) &&
  !path.includes("\0") &&
  path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")

/** Decoded skill folder name. The same rule guards slugs from the MCP gateway and keys of the local manifest. */
export const SafeSlug = Schema.String.check(Schema.makeFilter(isSafeSlug, { expected: "a skill slug (a-z, 0-9, - and _)" }))

/** Decoded relative path inside a skill folder; shared by MCP-served paths and local manifest keys. */
export const SafePath = Schema.String.check(Schema.makeFilter(isSafePath, { expected: "a relative path without `..`, `.`, `\\` or empty segments" }))
