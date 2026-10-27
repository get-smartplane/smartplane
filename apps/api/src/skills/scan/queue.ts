import { OrgId, SkillVersionId } from "@pc/domain"
import { Context, Effect, Layer, Schema } from "effect"
import { WorkerBindings } from "../../platform/bindings"

/** A `skill-scans` message: which version to scan. The consumer re-reads everything else from storage. */
export const SkillScanMessage = Schema.Struct({ orgId: OrgId, versionId: SkillVersionId })
export type SkillScanMessage = typeof SkillScanMessage.Type

const encode = Schema.encodeEffect(Schema.toCodecJson(SkillScanMessage))

/** Producer side of `skill-scans`: scans run in the queue consumer, never in the request. */
export class SkillScanQueue extends Context.Service<SkillScanQueue, {
  readonly send: (message: SkillScanMessage) => Effect.Effect<void>
}>()("api/skills/SkillScanQueue") {
  static readonly layer = Layer.effect(
    SkillScanQueue,
    Effect.gen(function*() {
      const queue = (yield* WorkerBindings).SKILL_SCANS
      return SkillScanQueue.of({
        send: Effect.fn("SkillScanQueue.send")(function*(message: SkillScanMessage) {
          const body = yield* Effect.orDie(encode(message))
          yield* Effect.promise(() => queue.send(body, { contentType: "json" }))
        })
      })
    })
  )
}
