import type { Guard, GuardToolCall } from "@pc/domain"
import { Effect } from "effect"
import type { ResourcesRepo } from "../../resources/resources-repo"
import type { Classifier } from "../classifier"
import type { CompiledDraft } from "../compiler"
import type { ExampleCalls } from "../examples/example-calls"
import { productName } from "../grounding/products"
import type { StoredToolDoc } from "../grounding/tool-doc"
import type { PinChildren } from "../pinning/children-store"
import type { ScannedPin } from "../pinning/scan"
import { draftQuestion, runSelfTest, type SelfTestWorld, type SourcedCall } from "./run"

interface Services {
  readonly examples: ExampleCalls["Service"]
  readonly resources: ResourcesRepo["Service"]
  readonly children: PinChildren["Service"]
}

/** What the first stage found that the test needs: the targets' tools and which of them get example calls. */
export interface TestTools {
  readonly tools: ReadonlyArray<StoredToolDoc>
  readonly exampleTools: ReadonlyArray<string>
}

/**
 * The calls every draft of a run is tested on: the ones people added and example calls written for the
 * run's tools. Each draft adds its own examples (`testDraft`). Pins come with the items known inside them.
 */
export const testWorld = (guard: Guard, found: TestTools, { examples, resources, children }: Services) =>
  Effect.gen(function*() {
    const exampleDocs = found.tools.filter((doc) => found.exampleTools.includes(doc.gatewayName))
    const generated = yield* examples.forRule(guard.rule, exampleDocs)
    const ids = [...new Set([...found.tools.map((doc) => doc.resourceId), ...guard.pins.map((pin) => pin.resourceId), ...guard.testCalls.flatMap((call) => call.resourceId ?? [])])]
    const byId = new Map((yield* resources.findMany(guard.orgId, ids)).map((resource) => [resource.id, resource]))
    const known = guard.pins.length === 0 ? new Map<string, ReadonlySet<string>>() : yield* children.get(guard.orgId, guard.pins.map((pin) => pin.id))
    const pins = guard.pins.map((pin): ScannedPin => {
      const resource = byId.get(pin.resourceId)
      const product = resource === undefined ? "" : productName(resource)
      const kind = product === "" || pin.kind.toLowerCase().includes(product.toLowerCase()) ? pin.kind : `${product} ${pin.kind}`
      return { pinId: pin.id, label: pin.label, kind, entityId: pin.entityId, children: known.get(pin.id) ?? new Set<string>() }
    })
    const world: SelfTestWorld = { resources: byId, tools: new Map(found.tools.map((doc) => [doc.gatewayName, doc])), threshold: guard.threshold, pins }
    const base: ReadonlyArray<SourcedCall> = [
      ...guard.testCalls.map(({ id: _id, addedBy: _by, addedAt: _at, ...call }) => ({ call, source: "custom" as const })),
      ...generated.map((call: GuardToolCall) => ({ call, source: "generated" as const }))
    ]
    return { world, base, generated: generated.length, wanted: exampleDocs.length }
  })

/** One draft through the classifier on the base calls and its own examples. Fails when the classifier does. */
export const testDraft = (classifier: Classifier["Service"], world: SelfTestWorld, base: ReadonlyArray<SourcedCall>, draft: CompiledDraft) =>
  runSelfTest(classifier, draftQuestion(draft), [...base, ...draft.calls.map((call) => ({ call, source: "draft" as const }))], { ...world, operations: draft.compiled.operations })
