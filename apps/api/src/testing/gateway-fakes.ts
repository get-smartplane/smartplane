import { type Action, type AuditEventType, AuditUnavailable, type AuditTarget, type GrantConditions, NotFound, type Resource, type ResourceConfig, ResourceId } from "@pc/domain"
import { Effect, Layer, Option, Redacted, Schema } from "effect"
import type { EffectiveAccess, EffectiveGrant } from "../access/resolution"
import { AuditLog } from "../audit/audit-log"
import { type Evaluation, GuardEvaluator, type ProposedAction } from "../guards/evaluator"
import { PinChildren } from "../guards/pinning/children-store"
import { KvCache } from "../platform/kv"
import { Secrets } from "../secrets/secrets"
import { auditEvent, now, orgId, userId } from "./fixtures"

export interface Recorded {
  readonly type: AuditEventType
  readonly target: AuditTarget | null
  readonly data: Readonly<Record<string, unknown>>
}

/** An AuditLog that keeps events in memory, for asserting what the gateway recorded; `unavailable` types fail. */
export const recordingAudit = (events: Array<Recorded>, unavailable: ReadonlySet<AuditEventType> = new Set()) => {
  const write = (type: AuditEventType, target: AuditTarget | null, data: Readonly<Record<string, unknown>> = {}) =>
    unavailable.has(type)
      ? Effect.fail(new AuditUnavailable({ message: "audit queue down" }))
      : Effect.sync(() => {
        events.push({ type, target, data })
        return auditEvent(events.length, { type, target, data })
      })
  return Layer.succeed(AuditLog, {
    write: (input) => write(input.type, input.target ?? null, input.data),
    writeBy: (_principal, type, target, data) => write(type, target, data),
    record: (input) => Effect.orDie(write(input.type, input.target ?? null, input.data)),
    by: (_principal, type, target, data) => Effect.orDie(write(type, target, data))
  })
}

/** Secrets keyed by resource id; a missing id fails like an absent secret. */
export const fakeSecrets = (values: Readonly<Record<string, string>>) =>
  Layer.succeed(Secrets, {
    store: () => Effect.succeed(1),
    reveal: (_orgId, resourceId) => {
      const value = values[resourceId]
      return value === undefined ? Effect.fail(new NotFound({ entity: "resource", id: resourceId })) : Effect.succeed(Redacted.make(value))
    },
    deliver: (_orgId, resourceId) => {
      const value = values[resourceId]
      return value === undefined ? Effect.fail(new NotFound({ entity: "resource", id: resourceId })) : Effect.succeed({ value: Redacted.make(value), version: 1 })
    }
  })

/** Guards that always answer `evaluation` and remember what they were asked. */
export const fakeGuards = (evaluation: Evaluation, asked: Array<ProposedAction> = []) =>
  Layer.succeed(GuardEvaluator, { evaluate: (_principal, action) => Effect.sync(() => (asked.push(action), evaluation)) })

export const allowAll: Evaluation = { decision: { _tag: "Allow", flaggedBy: [] }, scores: {} }

/** Workers KV over a Map, with the same schema round-trip as the real cache. */
export const memoryKv = (store = new Map<string, string>()) =>
  Layer.succeed(KvCache, {
    get: (key, schema) => {
      const text = store.get(key)
      if (text === undefined) return Effect.succeed(Option.none())
      return Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.toCodecJson(schema)))(text).pipe(Effect.option)
    },
    set: (key, schema, value) =>
      Schema.encodeEffect(Schema.fromJsonString(Schema.toCodecJson(schema)))(value).pipe(
        Effect.orDie,
        Effect.map((text) => void store.set(key, text))
      ),
    remove: (key) => Effect.sync(() => void store.delete(key))
  })

export const resourceOf = (id: string, name: string, config: ResourceConfig): Resource => ({
  id: ResourceId.make(id),
  orgId,
  projectId: null,
  name,
  description: "",
  config,
  createdBy: userId,
  createdAt: now,
  updatedAt: null
})

export const grantOf = (resource: Resource, action: Action, conditions: GrantConditions = {}): EffectiveGrant => ({
  resource,
  action,
  terms: [{ action, conditions }]
})

export const accessOf = (...grants: ReadonlyArray<EffectiveGrant>): EffectiveAccess => new Map(grants.map((grant) => [grant.resource.id, grant]))

/** Pin children in memory, for evaluator and pipeline tests. */
export const memoryPinChildren = (store = new Map<string, ReadonlyArray<string>>()) =>
  Layer.succeed(PinChildren, {
    get: (_orgId, pinIds) => Effect.succeed(new Map(pinIds.map((id) => [id, new Set(store.get(id) ?? [])]))),
    add: (_orgId, pinId, ids) => Effect.sync(() => void store.set(pinId, [...new Set([...(store.get(pinId) ?? []), ...ids])])),
    clear: (_orgId, pinId) => Effect.sync(() => void store.delete(pinId))
  })
