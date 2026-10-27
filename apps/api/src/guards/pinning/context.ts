import type { Guard } from "@pc/domain"
import type { PinnedContext } from "../classifier-state"
import type { KnownPin } from "./harvest"
import { pinKey } from "./ids"
import { type PinTouch, type ScannedPin, touchedPins } from "./scan"

/** What pins mean for one call: who it touches per guard, and what the gateway may harvest from its result. */
export interface PinView {
  readonly touches: ReadonlyMap<Guard["id"], ReadonlyArray<PinTouch>>
  /** Each guard's pins on the called resource, touched or not. */
  readonly pinsOf: ReadonlyMap<Guard["id"], ReadonlyArray<ScannedPin>>
  /** Every active pin on the called resource, for harvesting items from the result. */
  readonly known: ReadonlyArray<KnownPin>
  /** Pins the call itself names (or an item of): what it lists are their items. */
  readonly calledOn: ReadonlySet<string>
}

export const noPins: PinView = { touches: new Map(), pinsOf: new Map(), known: [], calledOn: new Set() }

/** Active pins of `guards` on one resource, with the items known inside each. */
export const pinView = (guards: ReadonlyArray<Guard>, resourceId: string, children: ReadonlyMap<string, ReadonlySet<string>>, args: unknown, product = ""): PinView => {
  // "Notion database": the product makes the kind readable to the classifier.
  const kindOf = (kind: string) => (product === "" || kind.toLowerCase().includes(product.toLowerCase()) ? kind : `${product} ${kind}`)
  const scanned = guards.flatMap((guard) =>
    guard.pins.filter((pin) => pin.resourceId === resourceId).map((pin) => ({
      guardId: guard.id,
      pin: { pinId: pin.id, label: pin.label, kind: kindOf(pin.kind), entityId: pin.entityId, children: children.get(pin.id) ?? new Set<string>() } satisfies ScannedPin
    }))
  )
  const touches = new Map<Guard["id"], Array<PinTouch>>()
  const calledOn = new Set<string>()
  for (const { guardId, pin } of scanned) {
    for (const touch of touchedPins(args, [pin])) {
      touches.set(guardId, [...(touches.get(guardId) ?? []), touch])
      calledOn.add(pin.pinId)
    }
  }
  const known = [...new Map(scanned.map(({ pin }) => [pin.pinId, { pinId: pin.pinId, entityId: pinKey(pin.entityId), children: pin.children }])).values()]
  const pinsOf = new Map<Guard["id"], Array<ScannedPin>>()
  for (const { guardId, pin } of scanned) pinsOf.set(guardId, [...(pinsOf.get(guardId) ?? []), pin])
  return { touches, pinsOf, known, calledOn }
}

const what = (touch: PinTouch) => (touch.via === "self" ? `${touch.label} (${touch.kind})` : `an item recognised inside ${touch.label} (${touch.kind})`)
const named = (pins: ReadonlyArray<Pick<ScannedPin, "label" | "kind">>) => pins.map((pin) => `${pin.label} (${pin.kind})`).join(" or ")

/**
 * The line added to a pinned guard's question: which named thing an id in the call matches, or that none
 * does. A fact about ids, stated as such: the classifier still judges the action, and a call that names
 * the thing some other way (a title in a URL) is still its to recognise.
 */
export const pinnedLine = (touches: ReadonlyArray<PinTouch>): string =>
  `Context: an id in this call matches ${touches.map(what).join(" and ")}, which the rule names.`

export const unpinnedLine = (pins: ReadonlyArray<ScannedPin>): string =>
  `Context: no id in this call matches ${named(pins)}, which the rule names, or any item recognised inside it.`

/** The context line for one guard on one call, if it pins anything on the called resource. */
export const contextLine = (view: PinView, guardId: Guard["id"]): string | undefined => {
  const touches = view.touches.get(guardId)
  if (touches !== undefined) return pinnedLine(touches)
  const pins = view.pinsOf.get(guardId)
  return pins === undefined || pins.length === 0 ? undefined : unpinnedLine(pins)
}

/**
 * What the classifier state says about pins: the named things the call touches, and one plain sentence
 * saying so (or that it touches none). Measured on Clef (see the pinning eval): the sentence is what moves
 * its answer; the structured list alone does not.
 */
export const pinnedContext = (view: PinView): { readonly touches: ReadonlyArray<PinnedContext>; readonly target?: string } => {
  const touches = [...new Map([...view.touches.values()].flat().map((touch) => [touch.pinId, touch])).values()]
  if (touches.length > 0) return { touches: touches.map(({ label, kind, via }) => ({ label, kind, via })), target: `${touches.map(what).join(" and ")}, which a rule names` }
  const pins = [...new Map([...view.pinsOf.values()].flat().map((pin) => [pin.pinId, pin])).values()]
  return pins.length === 0 ? { touches: [] } : { touches: [], target: `nothing a rule names: no id in this call matches ${named(pins)} or an item recognised inside it` }
}
