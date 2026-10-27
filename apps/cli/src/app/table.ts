export type Cell = string | number | boolean | null | undefined

const maxCell = 60

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

const clean = (value: Cell, max = maxCell) =>
  value === null || value === undefined || value === "" ? "-" : clip(String(value).replace(/\s+/g, " "), max)

/** A plain, aligned, pipe-friendly table: no borders, two-space gutters, `-` for empty cells. */
export const table = (headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<Cell>>): string => {
  const cells = rows.map((row) => headers.map((_, column) => clean(row[column])))
  const widths = headers.map((header, column) => Math.max(header.length, ...cells.map((row) => row[column]?.length ?? 0)))
  const line = (row: ReadonlyArray<string>) =>
    row.map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column] ?? 0))).join("  ").trimEnd()
  return [line(headers.map((header) => header.toUpperCase())), ...cells.map(line)].join("\n")
}

/** A table, or `empty` when there is nothing to show. */
export const tableOr = (empty: string, headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<Cell>>) =>
  rows.length === 0 ? empty : table(headers, rows)

/** Aligned `key: value` lines for a single record. */
export const details = (entries: ReadonlyArray<readonly [string, Cell]>): string => {
  const width = Math.max(...entries.map(([key]) => key.length))
  return entries.map(([key, value]) => `${`${key}:`.padEnd(width + 2)}${clean(value, Infinity)}`).join("\n")
}
