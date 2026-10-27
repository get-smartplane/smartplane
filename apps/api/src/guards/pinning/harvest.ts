import { idsOfValue, normaliseId, ownIdKey, uuidsIn } from "./ids"

export interface HarvestLimits {
  readonly maxDepth: number
  /** New child ids taken from one result, per pin. */
  readonly maxChildren: number
}

export const defaultHarvestLimits: HarvestLimits = { maxDepth: 10, maxChildren: 200 }

/** A pinned entity and the ids already known to be inside it, all normalised. */
export interface KnownPin {
  readonly pinId: string
  /** `pinKey` of the pinned entity id. */
  readonly entityId: string
  readonly children: ReadonlySet<string>
}

type Json = unknown
const isObject = (value: Json): value is Readonly<Record<string, Json>> => typeof value === "object" && value !== null && !Array.isArray(value)

/** Links carry an object's identity as a UUID inside them; their other text is not an id. */
const linkKey = (key: string) => /^(?:url|href|html_url|self|link)$/i.test(key)

/** The object's own ids: values of `id`, `key`, `number`, … and UUIDs in its own link. */
const ownIds = (object: Readonly<Record<string, Json>>): ReadonlyArray<string> =>
  Object.entries(object).flatMap(([key, value]) => {
    if (linkKey(key)) return typeof value === "string" ? uuidsIn(value) : []
    if (!ownIdKey(key)) return []
    // `key` also names schema fields ("status"); only an issue key such as ENG-142 is an item's id.
    if (/^key$/i.test(key) && !(typeof value === "string" && /^[A-Z][A-Z0-9]*-\d+$/.test(value))) return []
    return idsOfValue(value)
  })

/** Every id-like token anywhere under `value`, to the depth limit. */
const tokensUnder = (value: Json, depth: number, limits: HarvestLimits, out: Set<string>): Set<string> => {
  if (depth > limits.maxDepth) return out
  if (typeof value === "string" || typeof value === "number") for (const id of idsOfValue(value)) out.add(id)
  else if (Array.isArray(value)) for (const item of value) tokensUnder(item, depth + 1, limits, out)
  else if (isObject(value)) for (const item of Object.values(value)) tokensUnder(item, depth + 1, limits, out)
  return out
}

/** Text blocks of a tool result that are JSON; MCP servers often return their JSON as text. */
export const resultValues = (result: { readonly content: ReadonlyArray<Readonly<Record<string, Json>>>; readonly structuredContent?: Json }): ReadonlyArray<Json> => {
  const parsed = result.content.flatMap((block) => {
    if (block["type"] !== "text" || typeof block["text"] !== "string") return []
    try {
      return [JSON.parse(block["text"]) as Json]
    } catch {
      return [block["text"]]
    }
  })
  return result.structuredContent === undefined ? parsed : [result.structuredContent, ...parsed]
}

/** Keys under which a response lists the items of what was asked for, or describes them in text. */
const listKey = (key: string) => /^(?:results|children|items|data|rows|blocks|pages|entries|records|nodes|edges|list|values|content|text|markdown)$/i.test(key)

const uuidWithPrefix = /(\S{0,10})\b([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})\b/gi

/** People are referenced from inside every item ("created by"); their ids are never items of the pin. */
const personRef = /(?:user|users|person|people|member|members)(?::\/\/|\/)$/i

/**
 * Children of pinned entities found in one tool result, by id only. An object is a child when it has its own
 * id and contains a pinned (or already known child) id somewhere in its fields, e.g. a row whose parent is
 * the pinned database. When the call itself targeted the pin (`calledOn`), or an object in the result is the
 * pin, the items listed under it are children too, and so are the UUIDs in its plain-text description.
 * Titles and contents are never kept: only normalised ids leave this function.
 */
export const harvestChildren = (values: ReadonlyArray<Json>, pins: ReadonlyArray<KnownPin>, calledOn: ReadonlySet<string>, limits: HarvestLimits = defaultHarvestLimits): ReadonlyMap<string, ReadonlyArray<string>> => {
  const found = new Map<string, Set<string>>(pins.map((pin) => [pin.pinId, new Set<string>()]))
  const known = (pin: KnownPin, id: string) => id === pin.entityId || pin.children.has(id)
  const add = (pin: KnownPin, ids: ReadonlyArray<string>) => {
    const bucket = found.get(pin.pinId)
    for (const id of ids) if (bucket !== undefined && bucket.size < limits.maxChildren && !known(pin, id)) bucket.add(id)
  }

  // `listing`: pins whose items this value lists (an array or text answering a call on the pin).
  const visit = (value: Json, depth: number, listing: ReadonlyArray<KnownPin>) => {
    if (depth > limits.maxDepth) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1, listing)
      return
    }
    if (typeof value === "string") {
      for (const pin of listing) add(pin, [...value.matchAll(uuidWithPrefix)].filter((m) => !personRef.test(m[1] ?? "")).map((m) => normaliseId(m[2] ?? "")))
      return
    }
    if (!isObject(value)) return
    const own = ownIds(value)
    if (own.length > 0) {
      const inside = tokensUnder(value, 0, limits, new Set())
      for (const pin of pins) if ([...inside].some((id) => known(pin, id) && !own.includes(id))) add(pin, own)
      for (const pin of listing) add(pin, own)
    }
    // An object that is the pin (or a known item of it) lists its own items; a wrapper passes its listing on.
    const next = own.length > 0 ? pins.filter((pin) => own.some((id) => known(pin, id))) : listing
    for (const [key, item] of Object.entries(value)) visit(item, depth + 1, listKey(key) ? next : [])
  }

  const listed = pins.filter((pin) => calledOn.has(pin.pinId))
  for (const value of values) visit(value, 0, listed)
  return new Map([...found].flatMap(([pinId, ids]) => (ids.size === 0 ? [] : [[pinId, [...ids]] as const])))
}
