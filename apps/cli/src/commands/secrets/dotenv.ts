/**
 * One `NAME=value` line in the quoting dotenv parsers agree on: single quotes are literal, double quotes expand
 * `\n`, backticks are literal and may hold both kinds of quote. A value with a newline and every quote kind
 * falls back to JSON-style escapes inside double quotes.
 */
export const dotenvLine = (name: string, value: string): string => {
  const multiline = /[\r\n]/.test(value)
  if (!multiline && !value.includes("'")) return `${name}='${value}'`
  if (!value.includes("\"") && !value.includes("\\")) return `${name}="${value.replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`
  if (!multiline && !value.includes("`")) return `${name}=\`${value}\``
  return `${name}=${JSON.stringify(value)}`
}

export const dotenv = (entries: ReadonlyArray<readonly [string, string]>): string =>
  entries.map(([name, value]) => dotenvLine(name, value)).join("\n")
