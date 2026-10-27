/** Arguments on one line for a table cell: compact JSON, long strings shortened. */
export const compactArgs = (value: unknown, max = 160): string => {
  const text = JSON.stringify(value, (_key, item: unknown) => (typeof item === "string" && item.length > 60 ? `${item.slice(0, 57)}…` : item)) ?? "null"
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
