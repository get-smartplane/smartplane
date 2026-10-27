export interface DiffPart {
  readonly text: string
  readonly change: "same" | "added" | "removed"
}

/** A word-level diff (longest common subsequence), for showing what a recompile changed in a short question. */
export const wordDiff = (before: string, after: string): ReadonlyArray<DiffPart> => {
  const a = before.split(/(\s+)/)
  const b = after.split(/(\s+)/)
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = a[i] === b[j] ? (table[i + 1]![j + 1] ?? 0) + 1 : Math.max(table[i + 1]![j] ?? 0, table[i]![j + 1] ?? 0)
    }
  }
  const parts: Array<DiffPart> = []
  const push = (text: string, change: DiffPart["change"]) => {
    const last = parts.at(-1)
    if (last !== undefined && last.change === change) parts[parts.length - 1] = { text: last.text + text, change }
    else parts.push({ text, change })
  }
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) push(a[i++]!, "same"), j++
    else if ((table[i + 1]![j] ?? 0) >= (table[i]![j + 1] ?? 0)) push(a[i++]!, "removed")
    else push(b[j++]!, "added")
  }
  while (i < a.length) push(a[i++]!, "removed")
  while (j < b.length) push(b[j++]!, "added")
  return parts
}
