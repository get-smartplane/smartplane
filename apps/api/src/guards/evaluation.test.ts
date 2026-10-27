import { assert, describe, it } from "@effect/vitest"
import { type Approval, ApprovalId, type Guard, GuardId, type GuardMode, type Resource, ResourceId, UpstreamFailure } from "@pc/domain"
import { DateTime, Effect, Layer, Option } from "effect"
import { Approvals } from "../access/approvals"
import { now, orgId, otherUserId, userId, userPrincipal } from "../testing/fixtures"
import { fakeTeams } from "../testing/connection-fakes"
import { memoryPinChildren } from "../testing/gateway-fakes"
import { Classifier } from "./classifier"
import { applicableGuards, decide } from "./evaluation"
import { GuardEvaluator } from "./evaluator"
import { GuardsRepo } from "./guards-repo"

const resource: Resource = {
  id: ResourceId.make("res_reports001"),
  orgId,
  projectId: null,
  name: "Reports",
  description: "",
  config: { kind: "mcp_server", url: "https://mcp.example.com", transport: "streamable_http" },
  createdBy: userId,
  createdAt: now,
  updatedAt: null
}

const guard = (id: string, mode: GuardMode, threshold = 0.5, overrides: Partial<Guard> = {}): Guard => ({
  id: GuardId.make(`grd_${id}`),
  orgId,
  projectId: null,
  resourceIds: [],
  name: id,
  nameFollowsRule: false,
  modeFollowsRule: false,
  applies: null,
  approvers: [],
  rule: "nobody deletes reports from the Q3 folder",
  mode,
  threshold,
  status: "active",
  compiled: { instructions: "Does the action delete a Q3 report?", examples: [] },
  compiledVersion: 1,
  testCalls: [],
  pins: [],
  verify: null,
  createdBy: userId,
  createdAt: now,
  updatedAt: null,
  ...overrides
})

const scores = (entries: Record<string, number>) => new Map(Object.entries(entries).map(([id, p]) => [`grd_${id}`, p]))

describe("guard decisions", () => {
  it("triggers at or above the threshold only", () => {
    const enforce = guard("enforce01", "enforce", 0.7)
    assert.strictEqual(decide([enforce], scores({ enforce01: 0.69 }))._tag, "Allow")
    assert.deepStrictEqual(decide([enforce], scores({ enforce01: 0.7 })), {
      _tag: "Deny",
      reasons: [{ _tag: "GuardViolation", guardId: enforce.id, probability: 0.7 }]
    })
  })

  it("fails closed when the classifier is unavailable or skips an enforcing guard", () => {
    const enforce = guard("enforce01", "enforce")
    assert.deepStrictEqual(decide([enforce], undefined), { _tag: "Deny", reasons: [{ _tag: "GuardUnavailable", guardId: enforce.id }] })
    assert.strictEqual(decide([enforce], new Map())._tag, "Deny")
    assert.strictEqual(decide([guard("approve01", "require_approval")], undefined)._tag, "Deny")
  })

  it("only flags in monitor mode, even when unavailable", () => {
    const monitor = guard("monitor01", "monitor")
    assert.deepStrictEqual(decide([monitor], scores({ monitor01: 0.99 })), { _tag: "Allow", flaggedBy: [monitor.id] })
    assert.deepStrictEqual(decide([monitor], undefined), { _tag: "Allow", flaggedBy: [] })
  })

  it("asks for approval, but enforced denials win", () => {
    const approve = guard("approve01", "require_approval")
    assert.deepStrictEqual(decide([approve], scores({ approve01: 0.9 })), { _tag: "NeedsApproval", guardId: approve.id, flaggedBy: [] })
    const enforce = guard("enforce01", "enforce")
    assert.strictEqual(decide([approve, enforce], scores({ approve01: 0.9, enforce01: 0.9 }))._tag, "Deny")
  })

  it("selects active compiled guards scoped to the resource", () => {
    const guards = [
      guard("all00001", "enforce"),
      guard("draft001", "enforce", 0.5, { status: "draft" }),
      guard("uncomp01", "enforce", 0.5, { compiled: null }),
      guard("other001", "enforce", 0.5, { resourceIds: [ResourceId.make("res_otherres1")] }),
      guard("this0001", "enforce", 0.5, { resourceIds: [resource.id] })
    ]
    assert.deepStrictEqual(applicableGuards(guards, resource).map((g) => g.id), ["grd_all00001", "grd_this0001"])
  })
})

const evaluatorWith = (guards: ReadonlyArray<Guard>, classify: Classifier["Service"]["classify"], approval: Approval["status"]) => {
  const calls = { classify: 0 }
  const layer = GuardEvaluator.layer.pipe(
    Layer.provide(memoryPinChildren()),
    Layer.provide(fakeTeams([])),
    Layer.provide(Layer.succeed(GuardsRepo, {
      list: () => Effect.succeed(guards),
      active: () => Effect.succeed(guards),
      find: () => Effect.succeed(Option.none()),
      insert: () => Effect.void,
      save: () => Effect.void,
      setRun: () => Effect.succeed(false), saveForRun: () => Effect.succeed(false)
    })),
    Layer.provide(Layer.succeed(Classifier, {
      classify: (state, questions) => Effect.suspend(() => {
        calls.classify++
        return classify(state, questions)
      })
    })),
    Layer.provide(Layer.succeed(Approvals, {
      listPending: () => Effect.succeed([]),
      decide: () => Effect.die("unused"),
      request: (principal, guardId, request) =>
        Effect.succeed({
          id: ApprovalId.make("apr_approval01"),
          orgId,
          guardId,
          requestedBy: { type: "user", id: userId },
          request,
          status: approval,
          decidedBy: null,
          decidedAt: null,
          comment: null,
          createdAt: now,
          expiresAt: DateTime.add(now, { hours: 24 })
        })
    }))
  )
  return { calls, layer }
}

const evaluate = GuardEvaluator.use((evaluator) => evaluator.evaluate(userPrincipal(), { resource, tool: "delete", arguments: { path: "q3/x" } }))

describe("GuardEvaluator", () => {
  it.effect("evaluates every applicable guard in one classifier call", () => {
    const { calls, layer } = evaluatorWith(
      [guard("enforce01", "enforce"), guard("monitor01", "monitor")],
      (_, questions) => Effect.succeed(new Map(Array.from(questions.keys(), (id) => [id, 0.1]))),
      "pending"
    )
    return Effect.gen(function*() {
      const { decision, scores } = yield* evaluate
      assert.strictEqual(decision._tag, "Allow")
      assert.strictEqual(calls.classify, 1)
      assert.deepStrictEqual(Object.keys(scores).sort(), ["grd_enforce01", "grd_monitor01"])
    }).pipe(Effect.provide(layer))
  })

  it.effect("denies when Clef is down and an enforcing guard applies", () => {
    const { layer } = evaluatorWith([guard("enforce01", "enforce")], () => Effect.fail(new UpstreamFailure({ upstream: "clef", message: "down" })), "pending")
    return Effect.gen(function*() {
      const { decision } = yield* evaluate
      assert.deepStrictEqual(decision, { _tag: "Deny", reasons: [{ _tag: "GuardUnavailable", guardId: GuardId.make("grd_enforce01") }] })
    }).pipe(Effect.provide(layer))
  })

  it.effect("holds require_approval actions until approved", () => {
    const pending = evaluatorWith([guard("approve01", "require_approval")], () => Effect.succeed(scores({ approve01: 0.8 })), "pending")
    const approved = evaluatorWith([guard("approve01", "require_approval")], () => Effect.succeed(scores({ approve01: 0.8 })), "consumed")
    return Effect.gen(function*() {
      const held = yield* evaluate.pipe(Effect.provide(pending.layer))
      assert.deepStrictEqual(held.decision, { _tag: "PendingApproval", approvalId: ApprovalId.make("apr_approval01"), guardId: GuardId.make("grd_approve01") })
      const released = yield* evaluate.pipe(Effect.provide(approved.layer))
      assert.strictEqual(released.decision._tag, "Allow")
    })
  })

  it.effect("lets the author through a 'without my permission' guard, flagged, and holds everyone else", () => {
    const mine = guard("approve01", "require_approval", 0.5, { approvers: [{ _tag: "Author" }], createdBy: userId })
    const { layer } = evaluatorWith([mine], () => Effect.succeed(scores({ approve01: 0.9 })), "pending")
    return Effect.gen(function*() {
      const own = yield* evaluate
      assert.deepStrictEqual(own.decision, { _tag: "Allow", flaggedBy: [mine.id] })
      const other = yield* GuardEvaluator.use((evaluator) =>
        evaluator.evaluate(userPrincipal({ userId: otherUserId }), { resource, tool: "delete", arguments: { path: "q3/x" } })
      )
      assert.strictEqual(other.decision._tag, "PendingApproval")
    }).pipe(Effect.provide(layer))
  })

  it.effect("skips the classifier when no guard applies", () => {
    const { calls, layer } = evaluatorWith([], () => Effect.die("must not be called"), "pending")
    return Effect.gen(function*() {
      assert.strictEqual((yield* evaluate).decision._tag, "Allow")
      assert.strictEqual(calls.classify, 0)
    }).pipe(Effect.provide(layer))
  })
})
