import type { GuardPinCandidate, ResourceId } from "@pc/domain"
import { stems } from "../grounding/rank"
import { uuidsIn } from "./ids"

type Json = unknown
const isObject = (value: Json): value is Readonly<Record<string, Json>> => typeof value === "object" && value !== null && !Array.isArray(value)

/** A title as upstreams write it: a string, or Notion-style rich text (`[{plain_text}]`, `{title: [...]}`). */
const textOf = (value: Json): string | undefined => {
  if (typeof value === "string") return value.trim() === "" ? undefined : value.trim()
  if (Array.isArray(value)) {
    const joined = value.map((part) => (isObject(part) ? textOf(part["plain_text"]) ?? textOf(isObject(part["text"]) ? part["text"]["content"] : undefined) ?? "" : "")).join("")
    return joined.trim() === "" ? undefined : joined.trim()
  }
  return isObject(value) ? textOf(value["title"]) : undefined
}

const first = (object: Readonly<Record<string, Json>>, keys: ReadonlyArray<string>) => {
  for (const key of keys) {
    const text = textOf(object[key])
    if (text !== undefined) return text
  }
  return undefined
}

const labelKeys = ["title", "name", "full_name", "displayName", "display_name", "label", "subject", "summary"]
const urlKeys = ["url", "html_url", "web_url", "webUrl", "permalink", "link", "href"]
const kindKeys = ["type", "object", "kind", "__typename"]

/** One object that names something: an id (or a URL with one) and a title. */
const candidateOf = (object: Readonly<Record<string, Json>>, resourceId: ResourceId, fallbackKind: string): GuardPinCandidate | undefined => {
  const label = first(object, labelKeys)
  const url = urlKeys.map((key) => object[key]).find((value): value is string => typeof value === "string" && /^https?:\/\//.test(value))
  const rawId = ["id", "key", "gid", "node_id"].map((key) => object[key]).find((value) => typeof value === "string" || typeof value === "number")
  const entityId = rawId !== undefined ? String(rawId) : url === undefined ? undefined : uuidsIn(url)[0]
  if (label === undefined || entityId === undefined || entityId.length > 300) return undefined
  const kind = kindKeys.map((key) => object[key]).find((value): value is string => typeof value === "string" && value.length <= 60) ?? fallbackKind
  return { resourceId, entityId, label: label.slice(0, 200), kind, ...(url === undefined || url.length > 1000 ? {} : { url }) }
}

const collect = (value: Json, depth: number, out: Array<Readonly<Record<string, Json>>>) => {
  if (depth > 8 || out.length > 500) return
  if (Array.isArray(value)) for (const item of value) collect(item, depth + 1, out)
  else if (isObject(value)) {
    out.push(value)
    for (const item of Object.values(value)) collect(item, depth + 1, out)
  }
}

const filler = new Set(["the", "an", "of", "in", "on", "for", "my", "our", "to"])

/** Closer to the rule's words first: shared word stems, then shorter labels (an exact "Todo" before "Todo archive"). */
const score = (label: string, mention: ReadonlySet<string>) => {
  const words = stems(label)
  return words.filter((word) => mention.has(word)).length * 10 - words.length
}

/**
 * The things a lookup result names, best match for the rule's words first: every object with an id (or a
 * URL holding one) and a title. Only what the admin is shown to confirm; nothing is stored until they do.
 */
export const candidatesFrom = (values: ReadonlyArray<Json>, resourceId: ResourceId, mention: string, fallbackKind = "item", limit = 5): ReadonlyArray<GuardPinCandidate> => {
  const objects: Array<Readonly<Record<string, Json>>> = []
  for (const value of values) collect(value, 0, objects)
  const words = new Set(stems(mention).filter((word) => !filler.has(word)))
  const unique = new Map<string, GuardPinCandidate>()
  for (const object of objects) {
    const candidate = candidateOf(object, resourceId, fallbackKind)
    if (candidate !== undefined && !unique.has(candidate.entityId)) unique.set(candidate.entityId, candidate)
  }
  return [...unique.values()]
    .map((candidate, index) => ({ candidate, index, score: score(candidate.label, words) }))
    .filter((entry) => entry.score > 0 || words.size === 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.candidate)
}
