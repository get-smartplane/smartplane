export interface DotenvEntry {
  readonly name: string
  readonly value: string
  readonly line: number
}

const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s?(.*)$/

const unescapeDouble = (text: string) =>
  text.replace(/\\([nrt"\\])/g, (_, char: string) => (char === "n" ? "\n" : char === "r" ? "\r" : char === "t" ? "\t" : char))

/** The text up to the closing `quote`, which may sit on a later line; `undefined` when it never closes. */
const quoted = (first: string, rest: ReadonlyArray<string>, quote: string) => {
  const escaped = quote === "\""
  const closes = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      if (escaped && text[i] === "\\") i++
      else if (text[i] === quote) return i
    }
    return -1
  }
  let text = first
  for (let consumed = 0; ; consumed++) {
    const end = closes(text)
    if (end >= 0) return { raw: text.slice(0, end), consumed }
    const next = rest[consumed]
    if (next === undefined) return undefined
    text = `${text}\n${next}`
  }
}

/**
 * Reads a dotenv file the way the common parsers (dotenv, Bun, Vite) agree on: `#` comments, optional
 * `export`, single quotes literal, double quotes with `\n` escapes, backticks literal, quoted values over
 * several lines, and ` #` comments after unquoted values. Lines that do not parse are counted, not guessed.
 */
export const parseDotenv = (text: string): { readonly entries: ReadonlyArray<DotenvEntry>; readonly unreadable: number } => {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  const entries: Array<DotenvEntry> = []
  let unreadable = 0
  for (let index = 0; index < lines.length; index++) {
    const line = (lines[index] ?? "").trim()
    if (line === "" || line.startsWith("#")) continue
    const match = assignment.exec(line)
    const name = match?.[1]
    const value = match?.[2]?.trim() ?? ""
    if (name === undefined) {
      unreadable++
      continue
    }
    const quote = value[0]
    if (quote === "\"" || quote === "'" || quote === "`") {
      const found = quoted(value.slice(1), lines.slice(index + 1), quote)
      if (found === undefined) {
        unreadable++
        continue
      }
      entries.push({ name, value: quote === "\"" ? unescapeDouble(found.raw) : found.raw, line: index + 1 })
      index += found.consumed
      continue
    }
    entries.push({ name, value: value.replace(/\s+#.*$/, "").trim(), line: index + 1 })
  }
  return { entries, unreadable }
}
