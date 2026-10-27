/** A ClickHouse SQL token; whitespace and comments are dropped. `name` is a backtick- or double-quoted identifier. */
export type Token =
  | { readonly kind: "word"; readonly text: string }
  | { readonly kind: "name"; readonly text: string }
  | { readonly kind: "literal" }
  | { readonly kind: "punct"; readonly text: string }

/** Text the lexer cannot read the way ClickHouse would; the caller refuses the statement. */
export interface Unreadable {
  readonly unreadable: string
}

const wordChar = /[A-Za-z0-9_]/
const isUnreadable = (end: number | Unreadable): end is Unreadable => typeof end !== "number"

/** Index just past the closing `quote`, honouring backslash escapes and a doubled quote. */
const quotedEnd = (sql: string, start: number, quote: string): number | Unreadable => {
  let index = start + 1
  while (index < sql.length) {
    const char = sql.charAt(index)
    if (char === "\\") index += 2
    else if (char === quote && sql.charAt(index + 1) === quote) index += 2
    else if (char === quote) return index + 1
    else index++
  }
  return { unreadable: `an unterminated ${quote} quote` }
}

const blockCommentEnd = (sql: string, start: number): number | Unreadable => {
  const end = sql.indexOf("*/", start + 2)
  if (end === -1) return { unreadable: "an unterminated /* comment" }
  // ClickHouse nests block comments, most readers do not: refusing nesting keeps both readings identical.
  if (sql.slice(start + 2, end).includes("/*")) return { unreadable: "a nested /* comment" }
  return end + 2
}

const lineCommentEnd = (sql: string, start: number): number => {
  const newline = sql.indexOf("\n", start)
  return newline === -1 ? sql.length : newline + 1
}

/** `$tag$ ... $tag$` heredoc strings; undefined when `$` does not open one. */
const heredocEnd = (sql: string, start: number): number | Unreadable | undefined => {
  const opener = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(start))?.[0]
  if (opener === undefined) return undefined
  const end = sql.indexOf(opener, start + opener.length)
  return end === -1 ? { unreadable: "an unterminated heredoc string" } : end + opener.length
}

const wordEnd = (sql: string, start: number): number => {
  let end = start
  while (end < sql.length && wordChar.test(sql.charAt(end))) end++
  return end
}

/**
 * Tokenizes the way ClickHouse's lexer does for everything that can hide text (string literals, quoted
 * identifiers, heredocs, comments), and reports `Unreadable` instead of guessing.
 */
export const tokenize = (sql: string): ReadonlyArray<Token> | Unreadable => {
  const tokens: Array<Token> = []
  let index = 0
  while (index < sql.length) {
    const char = sql.charAt(index)
    const next = sql.charAt(index + 1)
    let end: number | Unreadable
    if (/\s/.test(char)) end = index + 1
    else if ((char === "-" && next === "-") || char === "#") end = lineCommentEnd(sql, index)
    else if (char === "/" && next === "*") end = blockCommentEnd(sql, index)
    else if (char === "'") {
      end = quotedEnd(sql, index, char)
      tokens.push({ kind: "literal" })
    } else if (char === "`" || char === "\"") {
      end = quotedEnd(sql, index, char)
      if (!isUnreadable(end)) tokens.push({ kind: "name", text: sql.slice(index + 1, end - 1) })
    } else if (wordChar.test(char)) {
      end = wordEnd(sql, index)
      tokens.push({ kind: "word", text: sql.slice(index, end) })
    } else {
      const heredoc = char === "$" ? heredocEnd(sql, index) : undefined
      end = heredoc ?? index + 1
      tokens.push(heredoc === undefined ? { kind: "punct", text: char } : { kind: "literal" })
    }
    if (isUnreadable(end)) return end
    index = end
  }
  return tokens
}
