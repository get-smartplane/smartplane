import {
  type AuditExportQuery,
  type AuditPage,
  type AuditQuery,
  type ChainVerification,
  type DeliverySummary,
  type Forbidden,
  InvalidInput,
  type Principal
} from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { requirePermission } from "../auth/permissions"
import { AuditLogClient } from "../platform/audit-log-client"
import { AuditLog } from "./audit-log"
import { toNdjson } from "./ndjson"
import { AuditStore } from "./store"

/** An export is evidence for one audit period; larger ranges should be read from the R2 archive. */
const MaxExportDays = 366

/** Auditor-facing reads. Every method requires `audit:read`; exports are themselves audited. */
export class AuditReader extends Context.Service<AuditReader, {
  readonly list: (principal: Principal, query: AuditQuery) => Effect.Effect<AuditPage, Forbidden>
  readonly deliveries: (principal: Principal) => Effect.Effect<ReadonlyArray<DeliverySummary>, Forbidden>
  readonly verify: (principal: Principal, fromSeq: number) => Effect.Effect<ChainVerification, Forbidden>
  readonly export: (principal: Principal, query: AuditExportQuery) => Effect.Effect<string, Forbidden | InvalidInput>
}>()("api/audit/AuditReader") {
  static readonly layer = Layer.effect(
    AuditReader,
    Effect.gen(function*() {
      const store = yield* AuditStore
      const chain = yield* AuditLogClient
      const audit = yield* AuditLog

      return AuditReader.of({
        list: Effect.fn("AuditReader.list")(function*(principal: Principal, query: AuditQuery) {
          yield* requirePermission(principal, "audit:read")
          return yield* store.page(principal.orgId, query)
        }),
        deliveries: Effect.fn("AuditReader.deliveries")(function*(principal: Principal) {
          yield* requirePermission(principal, "audit:read")
          return yield* store.deliveries(principal.orgId)
        }),
        verify: Effect.fn("AuditReader.verify")(function*(principal: Principal, fromSeq: number) {
          yield* requirePermission(principal, "audit:read")
          return yield* chain.verify(principal.orgId, fromSeq)
        }),
        export: Effect.fn("AuditReader.export")(function*(principal: Principal, query: AuditExportQuery) {
          yield* requirePermission(principal, "audit:read")
          if (!DateTime.isGreaterThan(query.to, query.from)) return yield* new InvalidInput({ message: "`to` must be after `from`", field: "to" })
          if (DateTime.isGreaterThan(query.to, DateTime.add(query.from, { days: MaxExportDays }))) {
            return yield* new InvalidInput({ message: `export at most ${MaxExportDays} days at a time`, field: "to" })
          }
          const events = yield* store.between(principal.orgId, query.from, query.to)
          yield* audit.by(principal, "audit.exported", null, {
            from: DateTime.formatIso(query.from),
            to: DateTime.formatIso(query.to),
            count: events.length
          })
          return yield* toNdjson(events)
        })
      })
    })
  )
}
