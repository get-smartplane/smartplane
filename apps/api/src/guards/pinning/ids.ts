/**
 * Ids as the gateway compares them. A UUID matches with or without dashes, in any case, alone or inside a
 * URL (`notion.so/acme/Todo-8c1d…`) or a prefixed form (`collection://…`); other ids (issue keys, numeric
 * ids, channel ids) match as whole values only.
 */
const uuid = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi
/** A 32-hex run glued to a title in a URL slug ("Todo-list-8c1d2e…"): `\b` does not see its start. */
const slugHex = /[-_/]([0-9a-f]{32})(?=$|[^0-9a-f])/gi

/** Canonical form: UUIDs as 32 lower-case hex digits; other ids trimmed and lower-cased. */
export const normaliseId = (id: string): string => {
  const trimmed = id.trim()
  const whole = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(trimmed)
  return whole ? trimmed.replace(/-/g, "").toLowerCase() : trimmed.toLowerCase()
}

/** Every UUID inside a string (dashed, dashless, in URLs), normalised. */
export const uuidsIn = (text: string): ReadonlyArray<string> => {
  const found = new Set<string>()
  for (const match of text.matchAll(uuid)) found.add(match[0].replace(/-/g, "").toLowerCase())
  for (const match of text.matchAll(slugHex)) if (match[1] !== undefined) found.add(match[1].toLowerCase())
  return [...found]
}

/** Numbers and short words collide across systems (issue 42 exists in every repo); they are not ids to track. */
const MinIdLength = 4

/**
 * The ids a field value stands for: the UUIDs inside it, or the value itself when it looks like an opaque
 * id (no spaces, not too short or long). Titles and prose never qualify.
 */
export const idsOfValue = (value: unknown): ReadonlyArray<string> => {
  if (typeof value === "number") return Number.isInteger(value) && Math.abs(value) >= 10 ** (MinIdLength - 1) ? [String(value)] : []
  if (typeof value !== "string") return []
  const uuids = uuidsIn(value)
  if (uuids.length > 0) return uuids
  const trimmed = value.trim()
  return trimmed.length >= MinIdLength && trimmed.length <= 120 && !/\s/.test(trimmed) ? [trimmed.toLowerCase()] : []
}

/** Keys that hold an object's own id. `parent_id`-style keys point elsewhere and are not its own. */
export const ownIdKey = (key: string): boolean => /^(?:id|uuid|key|number|gid|node_id)$/i.test(key)

/** The id a pin is matched by: the UUID inside its entity id (`collection://…`, a URL), else the id itself. */
export const pinKey = (entityId: string): string => uuidsIn(entityId)[0] ?? normaliseId(entityId)
