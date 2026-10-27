import type { OrgId } from "@pc/domain"
import { Effect } from "effect"
import type { ToolResult } from "../../mcp/sdk"
import type { PinChildren } from "./children-store"
import type { PinView } from "./context"
import { harvestChildren, resultValues } from "./harvest"

/**
 * After a successful call on a resource some active guard pins: records the ids of items inside the pins
 * that the result shows (rows of a pinned database), so later id-only calls to them are recognised. Never
 * fails the call: a harvest problem only means an item is not recognised yet.
 */
export const harvestResult = (children: PinChildren["Service"], orgId: OrgId, view: PinView, result: ToolResult) =>
  Effect.gen(function*() {
    if (view.known.length === 0 || result.isError === true) return
    const found = harvestChildren(resultValues(result), view.known, view.calledOn)
    yield* Effect.annotateCurrentSpan({ "pins.known": view.known.length, "pins.harvested": [...found.values()].reduce((sum, ids) => sum + ids.length, 0) })
    yield* Effect.forEach(found, ([pinId, ids]) => children.add(orgId, pinId, ids), { discard: true })
  }).pipe(
    Effect.catchCause((cause) => Effect.logWarning("pin harvest failed", cause)),
    Effect.withSpan("PinHarvest.result")
  )
