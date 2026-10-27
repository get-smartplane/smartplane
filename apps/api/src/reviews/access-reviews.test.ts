import { assert, describe, it } from "@effect/vitest"
import { type AccessReviewItem, type AuditEvent, MembershipId, ProjectId, type ReviewedAccess, RoleSlug, UserId } from "@pc/domain"
import { DateTime, Effect, Exit, Layer } from "effect"
import { TestClock } from "effect/testing"
import { GrantsRepo } from "../access/grants-repo"
import { AuditLog } from "../audit/audit-log"
import { ConnectionsRepo } from "../connections/connections-repo"
import { MachineTokensRepo } from "../delivery/machine-tokens-repo"
import { MembersRepo } from "../org/members-repo"
import { Offboarding } from "../org/offboarding"
import { ProjectsRepo } from "../org/projects-repo"
import { TestDatabase } from "../testing/database"
import { now, orgId, userId, userPrincipal } from "../testing/fixtures"
import { insertRow, memoryAuditQueue, seedOrg, seedResource, seedUser, seedUserGrant, selectRows } from "../testing/seed"
import { AccessReviews } from "./access-reviews"
import { AccessReviewsLive } from "./live"
import { AccessReviewsRepo } from "./reviews-repo"

const grace = UserId.make("usr_grace0001")
const owner = UserId.make("usr_owner0001")
const reviewer = (id: UserId, membership: string) =>
  userPrincipal({ userId: id, membershipId: MembershipId.make(membership), role: RoleSlug.make("admin"), permissions: ["reviews:manage"] })
const asGrace = reviewer(grace, "mem_grace0001")
const asOwner = reviewer(owner, "mem_owner0001")
const asAda = reviewer(userId, "mem_testmem01")

const layer = (events: Array<AuditEvent>) =>
  AccessReviewsLive.pipe(
    Layer.provideMerge(Offboarding.layer),
    Layer.provideMerge(Layer.mergeAll(AccessReviewsRepo.layer, GrantsRepo.layer, MembersRepo.layer, ProjectsRepo.layer, ConnectionsRepo.layer, MachineTokensRepo.layer)),
    Layer.provideMerge(AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(events)))),
    Layer.provideMerge(TestDatabase)
  )

const at = DateTime.formatIso(now)
const seed = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  yield* seedUser(grace, "grace@example.com", "mem_grace0001", "admin")
  yield* seedUser(owner, "owner@example.com", "mem_owner0001", "owner")
  yield* seedResource("res_variable01")
  yield* seedUserGrant("grt_ada0000001", "res_variable01")
  yield* seedUserGrant("grt_grace00001", "res_variable01", grace)
  const team = { type: "team", id: "team_testteam1" }
  yield* insertRow("grants", { ...teamGrant, subject: JSON.stringify(team), createdAt: at })
})
const teamGrant = {
  id: "grt_team000001", orgId, subjectType: "team", subjectId: "team_testteam1", resourceId: "res_variable01",
  action: "use", conditions: "{}", createdBy: owner
}

const find = (items: ReadonlyArray<AccessReviewItem>, match: (access: ReviewedAccess) => boolean) => {
  const item = items.find((candidate) => match(candidate.access))
  return item === undefined ? Effect.die(new Error("no such item")) : Effect.succeed(item)
}
const membership = (id: string) => (access: ReviewedAccess) => access._tag === "Membership" && access.membershipId === id
const grant = (id: string) => (access: ReviewedAccess) => access._tag === "Grant" && access.grantId === id
const failure = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) => Effect.map(Effect.flip(effect), (e) => e._tag)

describe("access reviews", () => {
  it.effect("snapshots access, enforces separation of duties, applies revocations and exports evidence", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      const reviews = yield* AccessReviews
      const review = yield* reviews.create(asGrace, { name: "Q4 2026", scope: { type: "org" }, dueAt: null })
      assert.strictEqual(review.itemCount, 6, "three memberships and three grants")
      const { items } = yield* reviews.get(asGrace, review.id)
      const decide = (principal: typeof asGrace, item: AccessReviewItem, decision: "keep" | "revoke") =>
        reviews.decide(principal, review.id, item.id, { decision, comment: `${decision} by review` })

      const ownMembership = yield* find(items, membership("mem_grace0001"))
      const ownGrant = yield* find(items, grant("grt_grace00001"))
      const teamItem = yield* find(items, grant("grt_team000001"))
      assert.deepStrictEqual(teamItem.beneficiaries, [userId], "team grants benefit the team's members")
      assert.strictEqual(yield* failure(decide(asGrace, ownMembership, "keep")), "Forbidden")
      assert.strictEqual(yield* failure(decide(asGrace, ownGrant, "keep")), "Forbidden")
      assert.strictEqual(yield* failure(decide(asAda, teamItem, "keep")), "Forbidden", "nor through a team")

      const adaGrant = yield* decide(asGrace, yield* find(items, grant("grt_ada0000001")), "revoke")
      assert.strictEqual(adaGrant.decision, "revoke")
      assert.isNotNull(adaGrant.appliedAt)
      const [revoked] = yield* selectRows("SELECT revoked_at, revoked_by FROM grants WHERE id = 'grt_ada0000001'")
      assert.strictEqual(revoked?.revokedBy, grace)
      assert.strictEqual(yield* failure(decide(asGrace, adaGrant, "keep")), "Conflict", "decisions are final")
      assert.strictEqual(yield* failure(reviews.close(asGrace, review.id)), "Conflict", "undecided items remain")

      const ownerItem = yield* find(items, membership("mem_owner0001"))
      assert.strictEqual(yield* failure(decide(asGrace, ownerItem, "revoke")), "Conflict", "the last owner stays")
      yield* decide(asGrace, ownerItem, "keep")
      yield* decide(asGrace, teamItem, "keep")
      yield* decide(asGrace, yield* find(items, membership("mem_testmem01")), "revoke")
      const [ada] = yield* selectRows("SELECT status FROM memberships WHERE id = 'mem_testmem01'")
      assert.strictEqual(ada?.status, "deprovisioned", "membership revocation runs the offboarding path")
      yield* decide(asOwner, ownMembership, "keep")
      yield* decide(asOwner, ownGrant, "keep")

      const closed = yield* reviews.close(asGrace, review.id)
      assert.strictEqual(closed.status, "closed")
      assert.strictEqual(closed.decidedCount, 6)
      const csv = yield* reviews.export(asGrace, review.id)
      const lines = csv.trimEnd().split("\r\n")
      assert.strictEqual(lines.length, 7)
      assert.match(lines[0] ?? "", /^review_id,review_name,closed_at,item_id,kind/)
      assert.include(csv, "grant,grt_ada0000001,user:usr_testuser01")

      const tampered = yield* Effect.exit(selectRows("UPDATE access_review_items SET decision = 'keep' WHERE decision = 'revoke'"))
      assert.isTrue(Exit.isFailure(tampered), "the database refuses to rewrite a decision")
      const types = events.map((event) => event.type)
      for (const type of ["access_review.created", "access_review.item_decided", "grant.revoked", "member.deprovisioned", "access_review.closed", "access_review.exported"] as const) {
        assert.include(types, type)
      }
    }).pipe(Effect.provide(layer(events)))
  })

  it.effect("scopes a project review to grants on that project's resources", () =>
    Effect.gen(function*() {
      yield* seed
      yield* insertRow("projects", { id: "prj_project001", orgId, name: "Payments", slug: "payments", createdAt: at })
      yield* insertRow("resources", {
        id: "res_inproject1", orgId, projectId: "prj_project001", kind: "variable", name: "region", description: "",
        config: JSON.stringify({ kind: "variable", value: "eu" }), createdBy: userId, createdAt: at
      })
      yield* seedUserGrant("grt_inproject1", "res_inproject1")
      const reviews = yield* AccessReviews
      const scope = { type: "project", projectId: ProjectId.make("prj_project001") } as const
      const review = yield* reviews.create(asGrace, { name: "Payments", scope, dueAt: null })
      const { items } = yield* reviews.get(asGrace, review.id)
      assert.deepStrictEqual(items.map((item) => item.access._tag === "Grant" ? item.access.grantId : item.access._tag), ["grt_inproject1"])
      const missing = { type: "project", projectId: ProjectId.make("prj_missing001") } as const
      assert.strictEqual(yield* failure(reviews.create(asGrace, { name: "x", scope: missing, dueAt: null })), "NotFound")
    }).pipe(Effect.provide(layer([]))))

  it.effect("requires reviews:manage and a closed review for evidence", () =>
    Effect.gen(function*() {
      yield* seed
      const reviews = yield* AccessReviews
      assert.strictEqual(yield* failure(reviews.list(userPrincipal())), "Forbidden")
      const review = yield* reviews.create(asGrace, { name: "Q4", scope: { type: "org" }, dueAt: null })
      assert.strictEqual(yield* failure(reviews.export(asGrace, review.id)), "Conflict")
    }).pipe(Effect.provide(layer([]))))
})
