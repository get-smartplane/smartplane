import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, AuditUnavailable } from "@pc/domain"
import { Effect, Exit, Layer, Option, Schema } from "effect"
import { AuditLogClient } from "../platform/audit-log-client"
import { AuditQueue } from "../platform/audit-queue"
import { sha256Hex } from "../platform/encoding"
import { orgId } from "../testing/fixtures"
import { memoryAuditQueue } from "../testing/seed"
import { AuditLog } from "./audit-log"
import { MaxDataBytes } from "./bounded-data"
import { derivedEventId } from "./derived-id"
import { AuditQueueMessageWire } from "./wire"

const QueueMessageLimit = 128 * 1024
const actor = { type: "system", id: "test" } as const
const bytesOf = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength
const encodedSize = (event: AuditEvent) => bytesOf(Schema.encodeSync(AuditQueueMessageWire)(event))

const directClient = (appended: Array<AuditEvent>, fails = false) =>
  Layer.succeed(AuditLogClient, {
    append: (_orgId, events) =>
      fails ? Effect.fail(new AuditUnavailable({ message: "object down" })) : Effect.sync(() => (appended.push(...events), events.length)),
    verify: () => Effect.die("not used")
  })

const auditOver = (queue: Layer.Layer<AuditQueue>) => AuditLog.layer.pipe(Layer.provide(queue))

describe("audit event size", () => {
  it.effect("replaces an oversized argument with its hash and length, so the message fits a queue", () => {
    const sent: Array<AuditEvent> = []
    const huge = "a".repeat(1_000_000)
    return Effect.gen(function*() {
      const event = yield* AuditLog.use((audit) =>
        audit.record({ orgId, type: "mcp.tool_call_started", actor, data: { tool: "write", arguments: { body: huge, small: "kept" } } })
      )
      const args = event.data.arguments
      assert.deepStrictEqual(args, {
        body: { omitted: "oversized", sha256: yield* Effect.promise(() => sha256Hex(huge)), bytes: 1_000_000, preview: huge.slice(0, 256) },
        small: "kept"
      })
      assert.isBelow(encodedSize(event), QueueMessageLimit / 2)
      assert.deepStrictEqual(sent[0]?.data, event.data)
    }).pipe(Effect.provide(auditOver(memoryAuditQueue(sent))))
  })

  it.effect("bounds data made of many small values too", () => {
    const sent: Array<AuditEvent> = []
    const many = Object.fromEntries(Array.from({ length: 20_000 }, (_, n) => [`k${n}`, `value-${n}`]))
    return Effect.gen(function*() {
      const event = yield* AuditLog.use((audit) => audit.record({ orgId, type: "mcp.tool_called", actor, data: { tool: "x", arguments: many } }))
      assert.isAtMost(bytesOf(event.data), MaxDataBytes)
      assert.strictEqual(event.data.tool, "x", "small fields survive")
      assert.propertyVal(event.data.arguments, "omitted", "oversized")
    }).pipe(Effect.provide(auditOver(memoryAuditQueue(sent))))
  })

  it.effect("leaves data that fits untouched", () => {
    const sent: Array<AuditEvent> = []
    return Effect.gen(function*() {
      const event = yield* AuditLog.use((audit) => audit.record({ orgId, type: "mcp.tool_called", actor, data: { arguments: { a: 1 } } }))
      assert.deepStrictEqual(event.data, { arguments: { a: 1 } })
    }).pipe(Effect.provide(auditOver(memoryAuditQueue(sent))))
  })
})

describe("audit delivery", () => {
  it.live("retries the queue, then appends straight to the AuditLog Durable Object", () => {
    const appended: Array<AuditEvent> = []
    let attempts = 0
    const queue = AuditQueue.fromSend(() => (attempts++, Promise.reject(new Error("queue down"))))
    return Effect.gen(function*() {
      const event = yield* AuditLog.use((audit) => audit.write({ orgId, type: "resource.updated", actor }))
      assert.strictEqual(attempts, 4, "first try plus three retries")
      assert.deepStrictEqual(appended.map((stored) => stored.id), [event.id])
    }).pipe(Effect.provide(auditOver(queue.pipe(Layer.provide(directClient(appended))))))
  })

  it.live("fails with AuditUnavailable when both paths are down; record turns it into a defect", () => {
    const queue = AuditQueue.fromSend(() => Promise.reject(new Error("queue down")))
    return Effect.gen(function*() {
      const written = yield* Effect.exit(AuditLog.use((audit) => audit.write({ orgId, type: "resource.updated", actor })))
      assert.isTrue(Exit.isFailure(written) && Option.isSome(Exit.findErrorOption(written)))
      const recorded = yield* Effect.exit(AuditLog.use((audit) => audit.record({ orgId, type: "resource.updated", actor })))
      assert.isTrue(Exit.isFailure(recorded) && Option.isNone(Exit.findErrorOption(recorded)))
    }).pipe(Effect.provide(auditOver(queue.pipe(Layer.provide(directClient([], true))))))
  })

  it.effect("uses the event id it is given, so re-recording a fact is idempotent downstream", () => {
    const sent: Array<AuditEvent> = []
    return Effect.gen(function*() {
      const id = yield* derivedEventId("approval.expired:apr_x1234567")
      const first = yield* AuditLog.use((audit) => audit.record({ id, orgId, type: "approval.expired", actor }))
      assert.strictEqual(first.id, id)
      assert.strictEqual(yield* derivedEventId("approval.expired:apr_x1234567"), id)
    }).pipe(Effect.provide(auditOver(memoryAuditQueue(sent))))
  })
})
