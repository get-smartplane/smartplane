import { describeTool, type ToolDoc } from "./tool-doc"

/**
 * Verbs and nouns that mean the same operation on different systems: a rule says "update", a tool says
 * "patch"; a rule says "to-do", Notion says "checkbox". Each group expands to all of its members.
 */
const synonymGroups: ReadonlyArray<ReadonlyArray<string>> = [
  ["update", "edit", "change", "modify", "patch", "set", "save", "rename", "move", "write", "mark", "replace", "check", "complete"],
  ["delete", "remove", "archive", "trash", "destroy", "drop", "purge", "erase"],
  ["create", "add", "new", "insert", "append", "post", "open", "make", "write", "import"],
  ["send", "post", "message", "email", "mail", "reply", "forward", "dm", "chat"],
  ["merge", "pull", "pr"],
  ["push", "commit", "file", "branch"],
  ["share", "permission", "public", "invite", "collaborator", "access"],
  ["read", "get", "list", "search", "fetch", "view", "query", "find", "retrieve", "download", "export"],
  ["todo", "task", "checkbox", "to_do", "checklist", "check", "done", "status", "item"],
  ["page", "doc", "document", "block", "row", "database", "data", "source"],
  ["issue", "ticket", "bug"],
  ["comment", "note"],
  ["refund", "charge", "payment"]
]

const stop = new Set(["the", "a", "an", "to", "in", "on", "of", "for", "and", "or", "no", "not", "nobody", "never", "can", "cant", "can't", "any", "anyone", "agent", "agents", "without", "my", "me", "is", "be", "from", "with", "it", "list", "only"])

const stem = (word: string): string => {
  if (word.length <= 3) return word
  const bare = word.replace(/(?:ing|ed|s)$/, "")
  return (bare.length < 3 ? word : bare).replace(/e$/, "")
}

/** Lower-case word stems: "deletes", "deleting" and "delete" all read "delet"; "to-do" reads "todo". */
export const stems = (text: string): ReadonlyArray<string> =>
  text.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/to-?dos?\b/g, "todo").split(/[^a-z0-9]+/).filter((word) => word.length > 1).map(stem)

const stemmedGroups = synonymGroups.map((group) => group.map(stem))

/** The stems plus every member of each synonym group one of them belongs to. Also used by gateway tool search. */
export const expand = (words: ReadonlyArray<string>): ReadonlySet<string> => {
  const out = new Set(words)
  for (const group of stemmedGroups) if (group.some((member) => words.includes(member))) for (const member of group) out.add(member)
  return out
}

const stopStems = new Set([...stop].map(stem))

const mutating = /\b(update|edit|change|modify|delete|remove|archive|create|add|send|post|merge|push|share|move|write|refund|close|cancel|drop|run)\w*/i

export interface RankOptions {
  readonly limit?: number
  /** Characters of rendered tool lines the compiler prompt may spend on tools (~4 chars per token). */
  readonly budgetChars?: number
}

/**
 * Orders tools by how much the rule's words (and their synonyms) appear in each tool's name, title,
 * description and argument names. A rule about changing things favours tools that write; a few read tools
 * stay in so the compiler and the examples can show allowed near misses (reading the to-do list).
 */
export const rankTools = (rule: string, docs: ReadonlyArray<ToolDoc>, { limit = 12, budgetChars = 4500 }: RankOptions = {}): ReadonlyArray<ToolDoc> => {
  const ruleWords = stems(rule).filter((word) => !stopStems.has(word))
  const exact = new Set(ruleWords)
  const related = expand(ruleWords)
  const wantsWrite = mutating.test(rule)
  const score = (doc: ToolDoc) => {
    const args = doc.inputSchema !== null && typeof doc.inputSchema === "object" && "properties" in doc.inputSchema && typeof doc.inputSchema.properties === "object" && doc.inputSchema.properties !== null
      ? Object.keys(doc.inputSchema.properties).join(" ")
      : ""
    const fields: ReadonlyArray<readonly [string, number]> = [[doc.name, 3], [doc.title ?? "", 2], [doc.description, 1], [args, 1]]
    let total = 0
    for (const [text, weight] of fields) {
      for (const word of new Set(stems(text))) total += exact.has(word) ? weight * 2 : related.has(word) ? weight : 0
    }
    if (wantsWrite && doc.access !== "read") total *= 1.5
    return total
  }
  const scored = docs.map((doc, index) => ({ doc, index, score: score(doc) })).sort((a, b) => b.score - a.score || a.index - b.index)
  const writes = scored.filter((entry) => entry.doc.access !== "read")
  const reads = scored.filter((entry) => entry.doc.access === "read")
  // Keep room for up to 4 reads, the near misses; fill the rest by score.
  const keptReads = reads.slice(0, Math.min(4, Math.ceil(limit / 5)))
  const ordered = [...writes.slice(0, limit - keptReads.length), ...keptReads].sort((a, b) => b.score - a.score || a.index - b.index)
  const picked: Array<ToolDoc> = []
  let used = 0
  for (const { doc } of ordered) {
    const cost = describeTool(doc).length + 1
    if (used + cost > budgetChars && picked.length > 0) continue
    picked.push(doc)
    used += cost
  }
  return picked
}
