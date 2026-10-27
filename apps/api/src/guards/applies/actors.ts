import type { GuardActorFilter, GuardActorRef } from "@pc/domain"
import { type OrgDirectory, resolveApprover } from "../compile/directory"

const modal = String.raw`(?:can|may|should|is\s+allowed\s+to|are\s+allowed\s+to|gets?\s+to|is\s+able\s+to|are\s+able\s+to)`
const negated = String.raw`(?:can(?:'|’)?t|cannot|can\s+not|must\s+not|mustn(?:'|’)?t|may\s+not|should\s+not|shouldn(?:'|’)?t|never|(?:is|are)\s+not\s+allowed\s+to|(?:isn|aren)(?:'|’)?t\s+allowed\s+to|do\s+not|don(?:'|’)?t|does\s+not|doesn(?:'|’)?t)`
const but = String.raw`(?:except(?:\s+for)?|but|other\s+than|besides|apart\s+from)`

/** Wording that makes everyone else allowed outright ("only finance can send"); the people are captured. */
const exceptPatterns: ReadonlyArray<RegExp> = [
  new RegExp(String.raw`^(?:only|just)\s+(.{1,80}?)\s+${modal}\b`, "i"),
  new RegExp(String.raw`^(?:nobody|no\s+one|no-one|none)\s+${but}\s+(.{1,80}?)\s+${modal}\b`, "i"),
  new RegExp(String.raw`^(?:everyone|everybody|anyone|anybody|all\s+members)\s+${but}\s+(.{1,80}?)\s+${negated}\b`, "i")
]

/** Wording that is about these people only ("contractors can't push"). */
const onlyPattern = new RegExp(String.raw`^(.{1,80}?)\s+${negated}\b`, "i")

/** Subjects that mean everyone, or the agent itself, not a group. */
const everyone = /^(?:nobody|no\s+one|no-one|none|anyone|anybody|everyone|everybody|agents?|the\s+agents?|ai|bots?|users?|people|we|i|you|it|they|members\s+or\s+agents)$/i

/**
 * Verbs after which the people named are not the ones acting: "finance can't be emailed", "contractors can't
 * receive payouts". There the caller is someone else, so a filter on the people named would skip exactly the
 * calls the rule is about.
 */
const passive = /^\s*(?:be|been|being|get|gets|got|receive|receives|obtain|become|have|has|appear|remain|stay)\b/i

/** Conditions that could hinge on who the caller is in ways a list of people cannot hold: left to the classifier. */
const conditional = /\b(?:unless|if|when|whenever|while|except\s+(?:when|if|for\s+calls))\b/i

const strip = (phrase: string) =>
  phrase.trim()
    .replace(/^(?:(?:any(?:one|body)?|people|members?|someone|everyone)\s+(?:in|on|from|of)\s+)/i, "")
    .replace(/^(?:the\s+)?members\s+of\s+/i, "")
    .trim()

const resolve = (phrase: string, directory: OrgDirectory): ReadonlyArray<GuardActorRef> | undefined => {
  const parts = phrase.split(/\s*(?:,|\bor\b|\band\b|\/|&)\s*/i).map(strip).filter((part) => part !== "")
  if (parts.length === 0 || parts.some((part) => everyone.test(part))) return undefined
  const refs: Array<GuardActorRef> = []
  for (const part of parts) {
    const resolved = resolveApprover(part, directory)
    // "My"/"I" and anything that names no role, team or member: not a list of people code can match.
    if (typeof resolved === "string" || resolved._tag === "Author") return undefined
    refs.push(resolved)
  }
  return refs
}

/**
 * Whose calls a rule is about, from its wording alone and only when that is unambiguous: one sentence, no
 * conditions, and every person it names resolved to a role, team or member of the org. Anything else gives
 * no filter, so the classifier keeps judging every caller: a wrong filter would silently switch the rule off.
 */
export const readActors = (rule: string, directory: OrgDirectory): GuardActorFilter | undefined => {
  const sentence = rule.trim().replace(/[.!]+$/, "")
  if (/[.;:!?\n]/.test(sentence) || conditional.test(sentence)) return undefined
  for (const pattern of exceptPatterns) {
    const match = pattern.exec(sentence)
    if (match === null) continue
    if (passive.test(sentence.slice(match[0].length))) return undefined
    const refs = resolve(match[1] ?? "", directory)
    const [first, ...rest] = refs ?? []
    return first === undefined ? undefined : { kind: "except", refs: [first, ...rest] }
  }
  const match = onlyPattern.exec(sentence)
  if (match === null || passive.test(sentence.slice(match[0].length))) return undefined
  const [first, ...rest] = resolve(match[1] ?? "", directory) ?? []
  return first === undefined ? undefined : { kind: "only", refs: [first, ...rest] }
}
