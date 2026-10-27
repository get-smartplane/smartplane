/**
 * Normalises an archive entry name to a safe relative path, or explains why it is refused. Absolute paths,
 * drive letters, backslashes, control characters and `..` segments are refused (path traversal: the CLI
 * writes these paths to disk). `.` and empty segments are dropped.
 */
export const normaliseEntryPath = (raw: string): { readonly path: string } | { readonly refused: string } => {
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) return { refused: `absolute path "${raw}"` }
  if (raw.includes("\\")) return { refused: `backslash in "${raw}"` }
  if (/[\u0000-\u001f\u007f]/.test(raw)) return { refused: "control character in a path" }
  const segments = raw.split("/").filter((segment) => segment !== "" && segment !== ".")
  if (segments.some((segment) => segment === "..")) return { refused: `path traversal in "${raw}"` }
  const path = segments.join("/")
  if (path.length > 512) return { refused: "path longer than 512 characters" }
  return { path }
}

/** OS clutter that zips made on macOS or Windows carry along; never part of a skill. */
export const isJunk = (path: string): boolean =>
  path.startsWith("__MACOSX/") || /(?:^|\/)(?:\.DS_Store|Thumbs\.db)$/.test(path)
