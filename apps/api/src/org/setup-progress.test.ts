import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, GuardId, ResourceId, RoleSlug } from "@pc/domain"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { AuditLog } from "../audit/audit-log"
import { GuardsRepo } from "../guards/guards-repo"
import { ResourcesRepo } from "../resources/resources-repo"
import { TestDatabase } from "../testing/database"
import { now, otherUserId, userPrincipal } from "../testing/fixtures"
import { memoryAuditQueue, seedOrg, seedResource, seedUser } from "../testing/seed"
import { OnboardingRepo } from "./onboarding-repo"
import { SetupProgress } from "./setup-progress"

const layer = (events: Array<AuditEvent>) =>
  SetupProgress.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(OnboardingRepo.layer, ResourcesRepo.layer, GuardsRepo.layer)),
    Layer.provide(AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(events)))),
    Layer.provideMerge(TestDatabase)
  )

const admin = userPrincipal({ role: RoleSlug.make("owner"), permissions: ["resources:read", "resources:manage", "audit:read"] })
const member = userPrincipal({ userId: otherUserId, permissions: ["resources:read"] })

const seed = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  yield* seedUser(otherUserId, "grace@example.com", "mem_colleague1")
})

describe("SetupProgress", () => {
  it.effect("starts open with every step to do, and resumes from what was saved", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      yield* seedResource("res_github0001")
      const progress = yield* SetupProgress
      const fresh = yield* progress.get(admin)
      assert.strictEqual(fresh.setup?.status, "open")
      assert.deepStrictEqual(fresh.setup?.steps, { tool: "todo", access: "todo", rule: "todo", team: "todo", agent: "todo" })

      yield* progress.updateSetup(admin, { steps: { tool: "done" }, toolResourceId: ResourceId.make("res_github0001") })
      yield* progress.updateSetup(admin, { steps: { access: "skipped" } })
      const resumed = yield* progress.get(admin)
      assert.deepStrictEqual(resumed.setup?.steps, { tool: "done", access: "skipped", rule: "todo", team: "todo", agent: "todo" })
      assert.strictEqual(resumed.setup?.toolResourceId, "res_github0001")

      assert.deepStrictEqual(events.map((event) => [event.type, event.data]), [
        ["onboarding.updated", { flow: "setup", steps: { tool: "done" }, toolResourceId: "res_github0001" }],
        ["onboarding.updated", { flow: "setup", steps: { access: "skipped" } }]
      ])
    }).pipe(Effect.provide(layer(events)))
  })

  it.effect("records nothing when an update changes nothing", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      const progress = yield* SetupProgress
      yield* progress.updateSetup(admin, { status: "dismissed" })
      yield* progress.updateSetup(admin, { status: "dismissed", steps: {} })
      assert.strictEqual(events.length, 1)
      assert.strictEqual((yield* progress.get(admin)).setup?.status, "dismissed")
    }).pipe(Effect.provide(layer(events)))
  })

  it.effect("refuses pointers to a tool or rule outside the org", () =>
    Effect.gen(function*() {
      yield* seed
      const progress = yield* SetupProgress
      const tool = yield* Effect.flip(progress.updateSetup(admin, { toolResourceId: ResourceId.make("res_elsewhere1") }))
      assert.strictEqual(tool._tag, "NotFound")
      const guard = yield* Effect.flip(progress.updateSetup(admin, { guardId: GuardId.make("grd_elsewhere1") }))
      assert.strictEqual(guard._tag, "NotFound")
    }).pipe(Effect.provide(layer([]))))

  it.effect("hides the org's setup from members and lets only admins change it", () =>
    Effect.gen(function*() {
      yield* seed
      const progress = yield* SetupProgress
      assert.isNull((yield* progress.get(member)).setup)
      const refused = yield* Effect.flip(progress.updateSetup(member, { status: "completed" }))
      assert.strictEqual(refused._tag, "Forbidden")
    }).pipe(Effect.provide(layer([]))))

  it.effect("welcomes invited members once, and never the owner", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      const progress = yield* SetupProgress
      assert.strictEqual((yield* progress.get(admin)).welcome.status, "completed")
      assert.strictEqual((yield* progress.get(member)).welcome.status, "pending")
      yield* progress.updateWelcome(member, { status: "completed" })
      assert.strictEqual((yield* progress.get(member)).welcome.status, "completed")
      assert.deepStrictEqual(events.map((event) => [event.type, event.target, event.data]), [
        ["onboarding.updated", { type: "member", id: "mem_testmem01" }, { flow: "welcome", status: "completed" }]
      ])
    }).pipe(Effect.provide(layer(events)))
  })
})
