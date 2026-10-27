import { CompiledGuard, Guard, GuardApplies, GuardApprover, GuardCustomCall, type GuardId, GuardPin, GuardVerifyRun, type GuardVerifyStage, type OrgId, ResourceId } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"
import { decodeFirst, decodeRows, encodeRow, JsonColumn } from "../platform/sql"

const GuardRow = Schema.toCodecJson(
  Schema.Struct({
    ...Guard.fields,
    resourceIds: JsonColumn(Schema.Array(ResourceId)),
    approvers: JsonColumn(Schema.Array(GuardApprover)),
    testCalls: JsonColumn(Schema.Array(GuardCustomCall)),
    pins: JsonColumn(Schema.Array(GuardPin)),
    nameFollowsRule: Schema.BooleanFromBit,
    modeFollowsRule: Schema.BooleanFromBit,
    applies: Schema.NullOr(JsonColumn(GuardApplies)),
    compiled: Schema.NullOr(JsonColumn(CompiledGuard)),
    verify: Schema.NullOr(JsonColumn(GuardVerifyRun))
  })
).pipe(Schema.decodeTo(Guard))
const encodeGuard = encodeRow(GuardRow)
const encodeRun = Schema.encodeEffect(Schema.fromJsonString(Schema.toCodecJson(GuardVerifyRun)))

/** Which run a background write is for, and the stages it may find that run in. */
export interface RunCondition {
  readonly runId: string
  readonly inStages: ReadonlyArray<GuardVerifyStage>
}

export class GuardsRepo extends Context.Service<GuardsRepo, {
  readonly list: (orgId: OrgId) => Effect.Effect<ReadonlyArray<Guard>>
  readonly active: (orgId: OrgId) => Effect.Effect<ReadonlyArray<Guard>>
  readonly find: (orgId: OrgId, id: GuardId) => Effect.Effect<Option.Option<Guard>>
  readonly insert: (guard: Guard) => Effect.Effect<void>
  /** Saves everything but the verify run, which only `setRun` and `saveForRun` write. */
  readonly save: (guard: Guard) => Effect.Effect<void>
  /**
   * Replaces the guard's verify run. With `when`, only while the stored run is that run in one of those
   * stages (cancel, fail, resume); without, unconditionally (a new verify supersedes whatever ran).
   */
  readonly setRun: (orgId: OrgId, id: GuardId, run: GuardVerifyRun, when?: RunCondition) => Effect.Effect<boolean>
  /**
   * Saves what a background stage produced (compiled draft, version, status, pins) together with the run's
   * next stage, only while the guard still carries that run in a working stage: a newer verify, a cancel or
   * a rule edit makes the write a no-op and returns false. `onlyDraft` also requires the guard still in draft.
   * Its mode and approvers land only on a draft whose mode still follows the rule (a person may have chosen one meanwhile).
   */
  readonly saveForRun: (guard: Guard, when: RunCondition, options?: { readonly onlyDraft?: boolean }) => Effect.Effect<boolean>
}>()("api/guards/GuardsRepo") {
  static readonly layer = Layer.effect(
    GuardsRepo,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const select = sql`SELECT id, org_id, project_id, resource_ids, name, name_follows_rule, rule, mode, mode_follows_rule, approvers, threshold,
                                status, compiled, compiled_version, test_calls, pins, applies, verify, created_by, created_at, updated_at FROM guards`
      const rows = decodeRows(GuardRow)
      const condition = (when: RunCondition) =>
        sql`json_extract(verify, '$.runId') = ${when.runId} AND json_extract(verify, '$.stage') IN ${sql.in(when.inStages)}`
      return GuardsRepo.of({
        list: Effect.fn("GuardsRepo.list")((orgId: OrgId) => rows(sql`${select} WHERE org_id = ${orgId} ORDER BY created_at DESC`)),
        active: Effect.fn("GuardsRepo.active")((orgId: OrgId) =>
          rows(sql`${select} WHERE org_id = ${orgId} AND status = 'active' AND compiled IS NOT NULL`)
        ),
        find: Effect.fn("GuardsRepo.find")((orgId: OrgId, id: GuardId) =>
          decodeFirst(GuardRow)(sql`${select} WHERE org_id = ${orgId} AND id = ${id}`)
        ),
        insert: Effect.fn("GuardsRepo.insert")(function*(guard: Guard) {
          yield* sql`INSERT INTO guards ${sql.insert(yield* encodeGuard(guard))}`.pipe(Effect.orDie)
        }),
        save: Effect.fn("GuardsRepo.save")(function*(guard: Guard) {
          // The run belongs to its background stages: a save from a request holding an older copy must not undo them.
          const { id: _id, orgId: _orgId, createdBy: _by, createdAt: _at, verify: _run, ...changes } = yield* encodeGuard(guard)
          const updatedAt = DateTime.formatIso(yield* DateTime.now)
          yield* sql`UPDATE guards SET ${sql.update({ ...changes, updatedAt })} WHERE id = ${guard.id} AND org_id = ${guard.orgId}`.pipe(
            Effect.orDie
          )
        }),
        setRun: Effect.fn("GuardsRepo.setRun")(function*(orgId: OrgId, id: GuardId, run: GuardVerifyRun, when?: RunCondition) {
          const verify = yield* Effect.orDie(encodeRun(run))
          const guarded = when === undefined ? sql`` : sql` AND ${condition(when)}`
          const changed = yield* sql<{ readonly id: string }>`UPDATE guards SET verify = ${verify}
            WHERE id = ${id} AND org_id = ${orgId}${guarded} RETURNING id`.pipe(Effect.orDie)
          return changed.length > 0
        }),
        saveForRun: Effect.fn("GuardsRepo.saveForRun")(function*(guard: Guard, when: RunCondition, options: { readonly onlyDraft?: boolean } = {}) {
          const draft = options.onlyDraft === true ? sql` AND status = 'draft'` : sql``
          const row = yield* encodeGuard(guard)
          const updatedAt = DateTime.formatIso(yield* DateTime.now)
          const changes = { compiled: row["compiled"], compiledVersion: row["compiledVersion"], status: row["status"], pins: row["pins"], verify: row["verify"], updatedAt }
          const follows = sql`mode_follows_rule = 1 AND status = 'draft'`
          const changed = yield* sql<{ readonly id: string }>`UPDATE guards SET ${sql.update(changes)},
            mode = CASE WHEN ${follows} THEN ${row["mode"]} ELSE mode END,
            approvers = CASE WHEN ${follows} THEN ${row["approvers"]} ELSE approvers END
            WHERE id = ${guard.id} AND org_id = ${guard.orgId} AND ${condition(when)}${draft} RETURNING id`.pipe(Effect.orDie)
          return changed.length > 0
        })
      })
    })
  )
}
