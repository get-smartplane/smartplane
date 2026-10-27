import { assert, describe, it } from "@effect/vitest"
import { type ApprovalRequest, type AuditEvent, GuardId, MembershipId, ResourceId, RoleSlug } from "@pc/domain"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { GuardsRepo } from "../guards/guards-repo"
import { activeGuard } from "../testing/delivery-world"
import { now, otherUserId, userPrincipal } from "../testing/fixtures"
import { resourceServices } from "../testing/resource-world"
import { seedOrg, seedUser } from "../testing/seed"
import { Approvals } from "./approvals"
import { ApprovalsRepo } from "./approvals-repo"

const guardId = GuardId.make("grd_approve01")
const requester = userPrincipal()
const approver = userPrincipal({ userId: otherUserId, membershipId: MembershipId.make("mem_testmem02"), role: RoleSlug.make("admin"), permissions: ["approvals:decide"] })
const action: ApprovalRequest = { resourceId: ResourceId.make("res_reports01"), tool: "delete", arguments: { path: "q3/report.pdf" } }

const services = (events: Array<AuditEvent>) =>
  Approvals.layer.pipe(Layer.provideMerge(Layer.mergeAll(ApprovalsRepo.layer, GuardsRepo.layer)), Layer.provideMerge(resourceServices(events)))

const setup = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  yield* seedUser(otherUserId, "bob@example.com", "mem_testmem02", "admin")
  yield* activeGuard("grd_approve01", "require_approval")
  const approvals = yield* Approvals
  const request = () => approvals.request(requester, guardId, action)
  const first = yield* request()
  yield* approvals.decide(approver, first.id, { decision: "approved" })
  return { first, request }
})

describe("approvals", () => {
  it.effect("allow exactly one call; the next identical call needs a new request", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      const { first, request } = yield* setup
      const used = yield* request()
      assert.strictEqual(used.id, first.id)
      assert.strictEqual(used.status, "consumed")
      assert.isTrue(events.some((event) => event.type === "approval.consumed"))

      const next = yield* request()
      assert.strictEqual(next.status, "pending")
      assert.notStrictEqual(next.id, first.id)
      assert.strictEqual((yield* request()).id, next.id)
    }).pipe(Effect.provide(services(events)))
  })

  it.effect("cannot be shared by two concurrent identical calls", () =>
    Effect.gen(function*() {
      const { request } = yield* setup
      const results = yield* Effect.all([request(), request(), request()], { concurrency: "unbounded" })
      assert.deepStrictEqual(results.map((approval) => approval.status).sort(), ["consumed", "pending", "pending"])
    }).pipe(Effect.provide(services([]))))
})
