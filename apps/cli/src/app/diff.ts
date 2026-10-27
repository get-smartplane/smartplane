type Op = { readonly kind: " " | "-" | "+"; readonly line: string }

/** Longest-common-subsequence line diff; config files are small, so O(n·m) is fine. */
const diffLines = (before: ReadonlyArray<string>, after: ReadonlyArray<string>): ReadonlyArray<Op> => {
  const lcs = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0))
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      const row = lcs[i]
      if (row === undefined) continue
      row[j] = before[i] === after[j] ? (lcs[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(lcs[i + 1]?.[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const ops: Array<Op> = []
  let i = 0
  let j = 0
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      ops.push({ kind: " ", line: before[i++] ?? "" })
      j++
    } else if (i < before.length && (j >= after.length || (lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0))) {
      ops.push({ kind: "-", line: before[i++] ?? "" })
    } else {
      ops.push({ kind: "+", line: after[j++] ?? "" })
    }
  }
  return ops
}

const split = (text: string) => (text === "" ? [] : text.replace(/\n$/, "").split("\n"))

/** A unified-style diff with `context` unchanged lines around each change; empty when nothing changes. */
export const unifiedDiff = (path: string, before: string, after: string, context = 3): string => {
  const ops = diffLines(split(before), split(after))
  const changed = ops.map((op, index) => (op.kind === " " ? -1 : index)).filter((index) => index >= 0)
  if (changed.length === 0) return ""
  const lines = [`--- ${path}`, `+++ ${path}`]
  let last = -1
  ops.forEach((op, index) => {
    if (!changed.some((at) => Math.abs(at - index) <= context)) return
    if (last >= 0 && index > last + 1) lines.push("@@")
    lines.push(`${op.kind}${op.line}`)
    last = index
  })
  return lines.join("\n")
}

/** A diff set in under a status line. */
export const indented = (text: string, by = "    ") => text.split("\n").map((line) => `${by}${line}`).join("\n")
