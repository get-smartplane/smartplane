import { defaultSkillScanPolicy, type OrgId, SkillScanPolicy, type UserId } from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { decodeFirst, JsonColumn } from "../../platform/sql"

const PolicyRow = Schema.Struct({ policy: JsonColumn(SkillScanPolicy) })
const encodePolicy = Schema.encodeEffect(JsonColumn(SkillScanPolicy))

/** Each org's skill scan policy; an org that never set one gets the default. */
export class SkillPolicyRepo extends Context.Service<SkillPolicyRepo, {
  readonly get: (orgId: OrgId) => Effect.Effect<SkillScanPolicy>
  readonly put: (orgId: OrgId, policy: SkillScanPolicy, by: UserId) => Effect.Effect<void>
}>()("api/skills/SkillPolicyRepo") {
  static readonly layer = Layer.effect(
    SkillPolicyRepo,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      return SkillPolicyRepo.of({
        get: Effect.fn("SkillPolicyRepo.get")(function*(orgId: OrgId) {
          const row = yield* decodeFirst(PolicyRow)(sql`SELECT policy FROM skill_scan_policies WHERE org_id = ${orgId}`)
          return Option.match(row, { onNone: () => defaultSkillScanPolicy, onSome: (found) => found.policy })
        }),
        put: Effect.fn("SkillPolicyRepo.put")(function*(orgId: OrgId, policy: SkillScanPolicy, by: UserId) {
          const json = yield* Effect.orDie(encodePolicy(policy))
          const now = DateTime.formatIso(yield* DateTime.now)
          yield* sql`INSERT INTO skill_scan_policies (org_id, policy, updated_by, updated_at) VALUES (${orgId}, ${json}, ${by}, ${now})
                     ON CONFLICT (org_id) DO UPDATE SET policy = excluded.policy, updated_by = excluded.updated_by,
                       updated_at = excluded.updated_at`.pipe(Effect.orDie)
        })
      })
    })
  )
}
