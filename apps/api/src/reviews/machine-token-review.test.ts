import { assert, describe, it } from "@effect/vitest"
import { MembershipId, RoleSlug, UserId } from "@pc/domain"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { systemActor } from "../audit/actor"
import { MachineTokens } from "../delivery/machine-tokens"
import { Offboarding } from "../org/offboarding"
import { admin, createSecret, deliveryServices } from "../testing/delivery-world"
import { now, orgId, userId, userPrincipal } from "../testing/fixtures"
import { seedOrg, seedUser } from "../testing/seed"
import { AccessReviews } from "./access-reviews"
import { AccessReviewsLive } from "./live"
import { AccessReviewsRepo } from "./reviews-repo"

const grace = UserId.make("usr_grace0001")
const reviewer = userPrincipal({
  userId: grace,
  membershipId: MembershipId.make("mem_grace0001"),
  role: RoleSlug.make("admin"),
  permissions: ["reviews:manage"]
})

const layer = AccessReviewsLive.pipe(Layer.provideMerge(AccessReviewsRepo.layer), Layer.provideMerge(deliveryServices([])))

describe("access reviews list machine tokens", () => {
  it.effect("with creator and allow-list, even after the creator is offboarded, and a reviewer can revoke them", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(now.epochMilliseconds)
      yield* seedOrg
      yield* seedUser(grace, "grace@example.com", "mem_grace0001", "admin")
      const stripe = yield* createSecret("stripe-key", "sk_live_review", { deliverable: true })
      const tokens = yield* MachineTokens
      const created = yield* tokens.create(admin, { name: "billing-api", allow: [stripe.id] })
      const revoked = yield* tokens.create(admin, { name: "old-worker", allow: [stripe.id] })
      yield* tokens.revoke(admin, revoked.token.id)
      yield* Offboarding.use((offboarding) => offboarding.deprovisionMember(orgId, MembershipId.make("mem_testmem01"), systemActor("scim"), "scim"))

      const reviews = yield* AccessReviews
      const review = yield* reviews.create(reviewer, { name: "Q4", scope: { type: "org" }, dueAt: null })
      const detail = yield* reviews.get(reviewer, review.id)
      assert.deepStrictEqual(detail.machineTokens, [{
        machineTokenId: created.token.id,
        name: "billing-api",
        createdBy: userId,
        projectId: null,
        allow: [stripe.id],
        expiresAt: created.token.expiresAt,
        lastUsedAt: null
      }], "only live tokens, with their creator, who is gone")

      // A reviewer (reviews:manage only) revokes it.
      yield* tokens.revoke(reviewer, created.token.id)
      assert.isNotNull((yield* tokens.list(reviewer)).find((token) => token.id === created.token.id)?.revokedAt)
    }).pipe(Effect.provide(layer)))
})
