import { MemberWelcome, type OrgId, OrgSetup, SetupSteps, type UserId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, encodeRow, JsonColumn } from "../platform/sql"

const SetupRow = Schema.toCodecJson(Schema.Struct({ ...OrgSetup.fields, steps: JsonColumn(SetupSteps) })).pipe(Schema.decodeTo(OrgSetup))
const encodeSetup = encodeRow(SetupRow)
const WelcomeRow = Schema.toCodecJson(MemberWelcome)

/** Setup progress per org and welcome progress per member. No row means "not started". */
export class OnboardingRepo extends Context.Service<OnboardingRepo, {
  readonly setup: (orgId: OrgId) => Effect.Effect<Option.Option<OrgSetup>>
  readonly saveSetup: (orgId: OrgId, setup: OrgSetup, by: UserId) => Effect.Effect<void>
  readonly welcome: (orgId: OrgId, userId: UserId) => Effect.Effect<Option.Option<MemberWelcome>>
  readonly saveWelcome: (orgId: OrgId, userId: UserId, welcome: MemberWelcome) => Effect.Effect<void>
}>()("api/org/OnboardingRepo") {
  static readonly layer = Layer.effect(
    OnboardingRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const iso = (at: DateTime.Utc | null) => Effect.map(DateTime.now, (now) => DateTime.formatIso(at ?? now))

      return OnboardingRepo.of({
        setup: Effect.fn("OnboardingRepo.setup")((orgId: OrgId) =>
          decodeFirst(SetupRow)(sql`SELECT status, steps, tool_resource_id, guard_id, updated_at FROM org_setups WHERE org_id = ${orgId}`)
        ),
        saveSetup: Effect.fn("OnboardingRepo.saveSetup")(function*(orgId: OrgId, setup: OrgSetup, by: UserId) {
          const row = yield* encodeSetup(setup)
          const updatedAt = yield* iso(setup.updatedAt)
          yield* sql`INSERT INTO org_setups (org_id, status, steps, tool_resource_id, guard_id, updated_by, updated_at)
                     VALUES (${orgId}, ${row.status}, ${row.steps}, ${row.toolResourceId}, ${row.guardId}, ${by}, ${updatedAt})
                     ON CONFLICT (org_id) DO UPDATE SET status = excluded.status, steps = excluded.steps,
                       tool_resource_id = excluded.tool_resource_id, guard_id = excluded.guard_id,
                       updated_by = excluded.updated_by, updated_at = excluded.updated_at`.pipe(Effect.orDie)
        }),
        welcome: Effect.fn("OnboardingRepo.welcome")((orgId: OrgId, userId: UserId) =>
          decodeFirst(WelcomeRow)(sql`SELECT status, updated_at FROM member_welcomes WHERE org_id = ${orgId} AND user_id = ${userId}`)
        ),
        saveWelcome: Effect.fn("OnboardingRepo.saveWelcome")(function*(orgId: OrgId, userId: UserId, welcome: MemberWelcome) {
          const updatedAt = yield* iso(welcome.updatedAt)
          yield* sql`INSERT INTO member_welcomes (org_id, user_id, status, updated_at) VALUES (${orgId}, ${userId}, ${welcome.status}, ${updatedAt})
                     ON CONFLICT (org_id, user_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`.pipe(Effect.orDie)
        })
      })
    })
  )
}
