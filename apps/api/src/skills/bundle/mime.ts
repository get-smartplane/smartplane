const byExtension: Readonly<Record<string, string>> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  xml: "application/xml",
  html: "text/html",
  css: "text/css",
  csv: "text/csv",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/x-typescript",
  py: "text/x-python",
  sh: "application/x-sh",
  bash: "application/x-sh",
  rb: "text/x-ruby",
  go: "text/x-go",
  rs: "text/x-rust",
  sql: "application/sql",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  zip: "application/zip",
  woff2: "font/woff2",
  ttf: "font/ttf"
}

export const extensionOf = (path: string): string => {
  const name = path.slice(path.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase()
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false })

/** UTF-8 without NUL bytes reads as text; anything else is served as a base64 blob. */
export const decodeText = (bytes: Uint8Array): string | undefined => {
  if (bytes.includes(0)) return undefined
  try {
    return strictUtf8.decode(bytes)
  } catch {
    return undefined
  }
}

/** Extensionless files that are text by convention. */
const textNames = new Set(["LICENSE", "LICENCE", "NOTICE", "README", "CHANGELOG", "Makefile", "Dockerfile", "Gemfile", "Procfile"])

/**
 * By name only, so listing a skill never reads file contents and a file's type is the same in
 * `resources/list` and `resources/read`.
 */
export const mimeTypeOf = (path: string): string => {
  const known = byExtension[extensionOf(path)]
  if (known !== undefined) return known
  return textNames.has(path.slice(path.lastIndexOf("/") + 1)) ? "text/plain" : "application/octet-stream"
}

const textApplications = new Set(["application/json", "application/yaml", "application/toml", "application/xml", "application/x-sh", "application/sql", "image/svg+xml"])

/** Text types are served as `text` when the bytes are UTF-8; everything else as a base64 `blob`. */
export const isTextMime = (mimeType: string): boolean => mimeType.startsWith("text/") || textApplications.has(mimeType)
