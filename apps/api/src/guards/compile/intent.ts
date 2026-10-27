import type { GuardMode } from "@pc/domain"

/** What the rule's wording says should happen when an action matches, before any model reads it. */
export interface RuleIntent {
  readonly mode: GuardMode
  /** The words that decided the mode; null when the rule has no recognisable cue. */
  readonly cue: string | null
  /** Who must approve, as written ("my", "an admin", "the security team"); empty means the author. */
  readonly approverPhrases: ReadonlyArray<string>
}

const grant = String.raw`(?:explicit\s+|written\s+|prior\s+)?(?:permission|approval|sign[- ]?off|consent|go[- ]ahead|ok(?:ay)?)`
const end = String.raw`(?=$|[\s.,;!?])`
/** Where a named approver ends: punctuation, the end, or the clause that follows ("from finance before ..."). */
const nameEnd = String.raw`(?=$|[.,;!?]|\s+(?:before|when|whenever|if|for|to|on|in|at)\b)`

/** Each pattern captures the approver phrase in its first non-empty group. */
const approvalCues: ReadonlyArray<RegExp> = [
  new RegExp(String.raw`\bwithout\s+(?:first\s+)?(?:getting\s+|asking\s+(?:for\s+)?)?(?:the\s+)?(.{0,40}?)\s*${grant}(?:\s+from\s+(.{1,40}?)${nameEnd})?${end}`, "i"),
  new RegExp(String.raw`\b(?:needs?|requires?|requiring|must\s+(?:get|have)|only\s+with|subject\s+to)\s+(?:an?\s+|the\s+)?(.{0,40}?)\s*${grant}(?:\s+from\s+(.{1,40}?)${nameEnd})?${end}`, "i"),
  new RegExp(String.raw`\b(?:approved|signed\s+off|okayed|cleared)\s+by\s+(.{1,40}?)${nameEnd}`, "i"),
  new RegExp(String.raw`\b(?:ask|check\s+with|run\s+it\s+by|get\s+approval\s+from)\s*(.{0,40}?)\s*(?:first\s+)?before\b`, "i"),
  new RegExp(String.raw`\b(?:hold|pause)\b.{0,40}\bfor\s+(.{0,40}?)\s*(?:approval|review|sign[- ]?off)${end}`, "i")
]

const monitorCue = /\b(alert(?:s)?(?:\s+(?:me|us))?|notify(?:\s+(?:me|us))?|let\s+(?:me|us)\s+know|tell\s+(?:me|us)|ping\s+(?:me|us)|keep\s+an\s+eye\s+on|watch(?:\s+for)?|flag|monitor|log\s+(?:it|when|whenever|every))\b/i

const enforceCue = /\b(never|nobody|no\s+one|no|can(?:'|’)?t|cannot|must\s+not|may\s+not|don(?:'|’)?t|do\s+not|only|except|forbid(?:den)?|block|prevent|disallow)\b/i

/** Phrases that read as an approver but only mean "someone". */
const generic = /^(?:any(?:one|body)?|some(?:one|body)|a\s+human|a\s+person|human|person|explicit|prior|written)?$/i

const splitApprovers = (phrase: string): ReadonlyArray<string> =>
  phrase.replace(/^(?:from|by|with)\s+/i, "").split(/\s*(?:,|\bor\b|\band\b|\/)\s*/i)
    .map((part) => part.trim())
    .filter((part) => !generic.test(part))

/**
 * Reads the response the rule asks for from its wording. Approval cues ("without my permission", "ask
 * before", "needs sign-off from finance") win over monitor cues ("alert me", "watch"), which win over the
 * enforce default ("never", "nobody", "only X can"). An approval cue with no named approver ("ask before")
 * means the rule's author: the person who wrote "ask" is the one to ask.
 */
export const readIntent = (rule: string): RuleIntent => {
  for (const pattern of approvalCues) {
    const match = pattern.exec(rule)
    if (match === null) continue
    const phrase = (match[2] ?? "").trim() || (match[1] ?? "").trim()
    return { mode: "require_approval", cue: match[0].trim(), approverPhrases: splitApprovers(phrase) }
  }
  const monitor = monitorCue.exec(rule)
  if (monitor !== null) return { mode: "monitor", cue: monitor[0], approverPhrases: [] }
  const enforce = enforceCue.exec(rule)
  return { mode: "enforce", cue: enforce === null ? null : enforce[0], approverPhrases: [] }
}
