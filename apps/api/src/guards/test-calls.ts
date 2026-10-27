import {
  type AddGuardTestCall,
  type Forbidden,
  type Guard,
  type GuardCustomCall,
  type GuardId,
  InvalidInput,
  NotFound,
  type Principal,
  type Resource,
  type UpstreamFailure
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { Separator } from "../mcp/naming"
import { slugify } from "../platform/ids"
import { ResourcesRepo } from "../resources/resources-repo"
import { Classifier } from "./classifier"
import { redactCredentials } from "./classifier-state"
import { questionFor } from "./evaluation"
import { productName } from "./grounding/products"
import { GuardToolDocs } from "./grounding/tool-docs"
import { GuardsRepo } from "./guards-repo"
import { runSelfTest } from "./self-test/run"

const MaxCustomCalls = 50
const decodeJson = Schema.decodeUnknownSync(Schema.Json)

const callId = () => `tc_${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("")}`

/** The resource a gateway tool name points at: `<resource-slug>__<tool>`. */
export const resourceForTool = (tool: string, resources: ReadonlyArray<Resource>): Resource | undefined => {
  const slug = tool.split(Separator)[0] ?? ""
  return tool.includes(Separator) ? resources.find((resource) => slugify(resource.name) === slug) : undefined
}

const sameCall = (a: { readonly tool: string; readonly arguments: unknown }, b: { readonly tool: string; readonly arguments: unknown }) =>
  a.tool === b.tool && JSON.stringify(a.arguments) === JSON.stringify(b.arguments)

/**
 * The calls people add to a rule's test set. Each one is stored with the guard (every verify runs it
 * again) and, when the rule is compiled, run through the classifier straight away so its result shows next
 * to the generated calls. Arguments are redacted of anything credential-shaped before they are stored.
 */
export class GuardTestCalls extends Context.Service<GuardTestCalls, {
  readonly add: (principal: Principal, id: GuardId, input: AddGuardTestCall) => Effect.Effect<Guard, Forbidden | NotFound | InvalidInput | UpstreamFailure>
  readonly remove: (principal: Principal, id: GuardId, callId: string) => Effect.Effect<Guard, Forbidden | NotFound>
}>()("api/guards/GuardTestCalls") {
  static readonly layer = Layer.effect(
    GuardTestCalls,
    Effect.gen(function*() {
      const guards = yield* GuardsRepo
      const resources = yield* ResourcesRepo
      const toolDocs = yield* GuardToolDocs
      const classifier = yield* Classifier
      const audit = yield* AuditLog

      const load = (principal: Principal, id: GuardId) =>
        guards.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "guard", id })))

      const add = Effect.fn("GuardTestCalls.add")(function*(principal: Principal, id: GuardId, input: AddGuardTestCall) {
        yield* requirePermission(principal, "guards:manage")
        const user = yield* requireUser(principal)
        const guard = yield* load(principal, id)
        if (guard.testCalls.length >= MaxCustomCalls) return yield* new InvalidInput({ message: `a rule keeps at most ${MaxCustomCalls} test calls` })
        const all = yield* resources.list(principal.orgId, {})
        const resource = input.resourceId === undefined ? resourceForTool(input.tool, all) : all.find((candidate) => candidate.id === input.resourceId)
        if (resource === undefined) return yield* new InvalidInput({ message: "name the tool as <resource>__<tool>, e.g. notion__notion-update-page", field: "tool" })
        const call: GuardCustomCall = {
          id: callId(),
          tool: input.tool,
          resourceId: resource.id,
          arguments: decodeJson(redactCredentials(input.arguments)),
          violates: input.violates,
          addedBy: user.userId,
          addedAt: yield* DateTime.now
        }
        let next: Guard = { ...guard, testCalls: [...guard.testCalls, call], updatedAt: yield* DateTime.now }
        if (guard.compiled !== null) {
          const target = { resource, product: productName(resource), matched: "scope" as const, mention: "" }
          const tools = (yield* toolDocs.forTargets(principal, [target])).flatMap((set) => set.tools)
          const { id: _id, addedBy: _by, addedAt: _at, ...asCall } = call
          const tested = yield* runSelfTest(classifier, questionFor(guard.compiled), [{ call: asCall, source: "custom" }], {
            resources: new Map([[resource.id, resource]]),
            tools: new Map(tools.map((doc) => [doc.gatewayName, doc])),
            threshold: guard.threshold
          })
          const previous = guard.compiled.selfTest
          const calls = [...(previous?.calls ?? []).filter((old) => !(old.source === "custom" && sameCall(old, call))), ...tested]
          next = { ...next, compiled: { ...guard.compiled, selfTest: { threshold: guard.threshold, calls, retried: previous?.retried ?? false } } }
        }
        yield* guards.save(next)
        yield* audit.by(principal, "guard.updated", { type: "guard", id }, { testCallAdded: { id: call.id, tool: call.tool, violates: call.violates } })
        return next
      })

      const remove = Effect.fn("GuardTestCalls.remove")(function*(principal: Principal, id: GuardId, removedId: string) {
        yield* requirePermission(principal, "guards:manage")
        const guard = yield* load(principal, id)
        const removed = Option.fromUndefinedOr(guard.testCalls.find((call) => call.id === removedId))
        if (Option.isNone(removed)) return yield* new NotFound({ entity: "guard", id: `${id}/test-calls/${removedId}` })
        const selfTest = guard.compiled?.selfTest
        const compiled = guard.compiled === null || selfTest === undefined
          ? guard.compiled
          : { ...guard.compiled, selfTest: { ...selfTest, calls: selfTest.calls.filter((call) => !(call.source === "custom" && sameCall(call, removed.value))) } }
        const next: Guard = { ...guard, compiled, testCalls: guard.testCalls.filter((call) => call.id !== removedId), updatedAt: yield* DateTime.now }
        yield* guards.save(next)
        yield* audit.by(principal, "guard.updated", { type: "guard", id }, { testCallRemoved: { id: removedId, tool: removed.value.tool } })
        return next
      })

      return GuardTestCalls.of({ add, remove })
    })
  )
}
