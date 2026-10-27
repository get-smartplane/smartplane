import type { Guard, GuardGrounding, GuardPin, GuardPinLookup, Principal } from "@pc/domain"
import { Context, Duration, Effect, Layer } from "effect"
import { WorkersAi } from "../platform/ai"
import { AppConfig } from "../platform/config"
import { ResourcesRepo } from "../resources/resources-repo"
import { rankTools } from "./grounding/rank"
import { modelTargets } from "./grounding/target-model"
import { matchTargets } from "./grounding/targets"
import { GuardToolDocs, type TargetTools } from "./grounding/tool-docs"
import type { ToolDoc } from "./grounding/tool-doc"
import { PinLookup } from "./pinning/lookup"

/** Tools to write example calls for: the most relevant that change things, and two reads for near misses. */
export const exampleTools = (ranked: ReadonlyArray<ToolDoc>): ReadonlyArray<ToolDoc> => [
  ...ranked.filter((doc) => doc.access !== "read").slice(0, 4),
  ...ranked.filter((doc) => doc.access === "read").slice(0, 2)
]

const noteFor = ({ target, summary }: TargetTools) =>
  `- ${target.product} ("${target.resource.name}"): ${summary ?? "no tool list available"} Its tools could not be listed; connect it to improve accuracy.`

/** Each model call keeps its own deadline; past these the stage goes on without a lookup or a re-check. */
const LookupTimeout = Duration.seconds(15)
const CheckTimeout = Duration.seconds(10)

/** What verify's first stage found: the rule's systems and their real tools, what it names, and the pins as re-checked. */
export interface FoundTargets {
  readonly grounding: GuardGrounding
  readonly tools: ReadonlyArray<ToolDoc>
  readonly exampleTools: ReadonlyArray<string>
  readonly notes: ReadonlyArray<string>
  readonly pinning?: GuardPinLookup
  readonly pins: ReadonlyArray<GuardPin>
}

/**
 * Verify's `finding_targets` stage, grounded in the systems a rule names: find the org's resources the rule
 * mentions, collect their real tools, look up the specific thing the rule names and re-check confirmed
 * pins, all as the verifying admin. Nothing here pins anything: candidates wait for an admin to confirm.
 */
export class GuardVerifier extends Context.Service<GuardVerifier, {
  readonly findTargets: (principal: Principal, guard: Guard) => Effect.Effect<FoundTargets>
}>()("api/guards/GuardVerifier") {
  static readonly layer = Layer.effect(
    GuardVerifier,
    Effect.gen(function*() {
      const resourcesRepo = yield* ResourcesRepo
      const toolDocs = yield* GuardToolDocs
      const pinning = yield* PinLookup
      const ai = yield* WorkersAi
      const model = (yield* AppConfig).COMPILER_MODEL

      const lookup = (principal: Principal, guard: Guard, sets: ReadonlyArray<TargetTools>): Effect.Effect<GuardPinLookup | undefined> => {
        const previous = guard.compiled?.pinning
        // "None of these" stands until the rule changes (a rule edit drops the compiled draft and this with it).
        if (guard.pins.length > 0 || previous?.status === "dismissed") return Effect.succeed(guard.pins.length > 0 ? undefined : previous)
        return pinning.lookup(principal, guard.rule, sets).pipe(
          Effect.timeoutOrElse({ duration: LookupTimeout, orElse: () => Effect.succeed<GuardPinLookup>({ status: "failed", candidates: [], detail: "The lookup took too long; verify again to retry." }) }),
          Effect.catchCause((cause) => Effect.as(Effect.logWarning("pin lookup failed", cause), { status: "failed", candidates: [] } satisfies GuardPinLookup))
        )
      }

      const findTargets = Effect.fn("GuardVerifier.findTargets")(function*(principal: Principal, guard: Guard) {
        const resources = yield* resourcesRepo.list(guard.orgId, {})
        const matched = matchTargets(guard.rule, resources, guard.resourceIds)
        const targets = matched.targets.length > 0 || guard.resourceIds.length > 0 ? matched.targets : yield* modelTargets(ai, model, guard.rule, resources)
        const sets = yield* toolDocs.forTargets(principal, targets)
        const ranked = rankTools(guard.rule, sets.flatMap((set) => set.tools))
        const notes = sets.filter((set) => set.tools.length === 0 && set.target.resource.config.kind !== "database").map(noteFor)
        yield* Effect.annotateCurrentSpan({ "guard.targets": targets.length, "guard.tools": ranked.length })

        const [pinLookup, pins] = yield* Effect.all([
          lookup(principal, guard, sets),
          guard.pins.length === 0 ? Effect.succeed(guard.pins) : pinning.check(principal, guard.pins, sets).pipe(Effect.timeoutOrElse({ duration: CheckTimeout, orElse: () => Effect.succeed(guard.pins) }))
        ], { concurrency: "unbounded" })

        const grounding: GuardGrounding = {
          targets: sets.map(({ target, source, tools }) => ({
            resourceId: target.resource.id,
            name: target.resource.name,
            product: target.product,
            matched: target.matched,
            mention: target.mention,
            tools: source,
            toolCount: tools.length
          })),
          unknown: matched.unknown,
          tools: ranked.map((doc) => doc.gatewayName)
        }
        return {
          grounding,
          tools: ranked,
          exampleTools: exampleTools(ranked).map((doc) => doc.gatewayName),
          notes,
          ...(pinLookup === undefined ? {} : { pinning: pinLookup }),
          pins
        } satisfies FoundTargets
      })

      return GuardVerifier.of({ findTargets })
    })
  )
}
