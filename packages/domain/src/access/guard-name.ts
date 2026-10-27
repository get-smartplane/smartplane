/**
 * The name a guard gets from its rule when nobody named it: the first sentence, trimmed to the 80
 * characters a `Name` allows. Shared by the API, dashboard and CLI so a derived name is recognisable as one.
 *
 * "Nobody deletes reports from the Q3 folder. Ask Dana." → "Nobody deletes reports from the Q3 folder"
 */
export const nameFromRule = (rule: string): string => {
  const sentence = (rule.trim().split(/(?<=[.!?])\s/)[0] ?? "").replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim()
  if (sentence.length === 0) return "Untitled rule"
  return sentence.length <= 80 ? sentence : `${sentence.slice(0, 79).trimEnd()}…`
}
