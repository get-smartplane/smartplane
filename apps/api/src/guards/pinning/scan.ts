import { idsOfValue, pinKey, uuidsIn } from "./ids"

/** A pin as the call-time scan sees it: its id and what to call it, plus the ids of items seen inside it. */
export interface ScannedPin {
  readonly pinId: string
  readonly label: string
  readonly kind: string
  readonly entityId: string
  readonly children: ReadonlySet<string>
}

export interface PinTouch {
  readonly pinId: string
  readonly label: string
  readonly kind: string
  /** `self`: the call names the pinned thing; `child`: an item recognised inside it. */
  readonly via: "self" | "child"
}

const strings = (value: unknown, depth: number, out: Array<string>): Array<string> => {
  if (depth > 12 || out.length > 2000) return out
  if (typeof value === "string") out.push(value)
  else if (typeof value === "number") out.push(String(value))
  else if (Array.isArray(value)) for (const item of value) strings(item, depth + 1, out)
  else if (value !== null && typeof value === "object") for (const item of Object.values(value)) strings(item, depth + 1, out)
  return out
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Which pins a call's arguments touch: a pinned id or the id of an item harvested from inside it, anywhere
 * in the arguments, dashed or not, alone or inside a URL. A non-UUID pinned id (a repository's
 * `acme/billing`, a channel id) also matches as a delimited part of a longer string such as a URL path.
 * Deterministic and local: nothing is fetched.
 */
export const touchedPins = (args: unknown, pins: ReadonlyArray<ScannedPin>): ReadonlyArray<PinTouch> => {
  if (pins.length === 0) return []
  const values = strings(args, 0, [])
  const tokens = new Set(values.flatMap((value) => [...uuidsIn(value), ...idsOfValue(value)]))
  const lowered = values.map((value) => value.toLowerCase())
  return pins.flatMap((pin): ReadonlyArray<PinTouch> => {
    const self = pinKey(pin.entityId)
    const bare = !/^[0-9a-f]{32}$/.test(self) && self.length >= 4
    const inText = bare && lowered.some((value) => new RegExp(`(?:^|[^a-z0-9_.-])${escape(self)}(?:$|[^a-z0-9_.-])`).test(value))
    if (tokens.has(self) || inText) return [{ pinId: pin.pinId, label: pin.label, kind: pin.kind, via: "self" }]
    if ([...tokens].some((token) => pin.children.has(token))) return [{ pinId: pin.pinId, label: pin.label, kind: pin.kind, via: "child" }]
    return []
  })
}
