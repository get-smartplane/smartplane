import { type Conflict, DefaultToolSearchThreshold, type Org, RoleSlug, type SessionUser, UpstreamFailure } from "@pc/domain"
import { Context, DateTime, Effect, Layer, type Redacted } from "effect"
import { AuditLog } from "../audit/audit-log"
import { UsersRepo } from "../auth/users-repo"
import { WorkOS } from "../auth/workos"
import { Ids, slugify } from "../platform/ids"
import { MembersRepo } from "./members-repo"
import { OrgsRepo } from "./orgs-repo"

const DefaultAuditRetentionDays = 365

/** Self-serve sign-up: creates the WorkOS org, mirrors it, makes the creator its owner and re-scopes the session. */
export class Onboarding extends Context.Service<Onboarding, {
  readonly createOrg: (
    user: SessionUser,
    name: string,
    session: Redacted.Redacted<string>
  ) => Effect.Effect<{ readonly org: Org; readonly session: Redacted.Redacted<string> }, Conflict | UpstreamFailure>
}>()("api/org/Onboarding") {
  static readonly layer = Layer.effect(
    Onboarding,
    Effect.gen(function*() {
      const workos = yield* WorkOS
      const orgs = yield* OrgsRepo
      const members = yield* MembersRepo
      const users = yield* UsersRepo
      const audit = yield* AuditLog

      return Onboarding.of({
        createOrg: Effect.fn("Onboarding.createOrg")(function*(user: SessionUser, name: string, session: Redacted.Redacted<string>) {
          const workosUserId = yield* Effect.fromOption(yield* users.workosIdOf(user.userId)).pipe(
            Effect.mapError(() => new UpstreamFailure({ upstream: "workos", message: "the signed-in user is not mirrored yet" }))
          )
          const workosOrgId = yield* workos.createOrganization(name)
          const workosMembershipId = yield* workos.createMembership(workosOrgId, workosUserId, "admin")
          const id = yield* Ids.org
          // The random id suffix keeps slugs unique without asking the user to pick one.
          const org: Org = { id, name, slug: `${slugify(name).slice(0, 30)}-${id.slice(-6)}`, auditRetentionDays: DefaultAuditRetentionDays, toolSearchThreshold: DefaultToolSearchThreshold, createdAt: yield* DateTime.now }
          yield* orgs.insert(org, workosOrgId)
          const membershipId = yield* Ids.membership
          yield* members.insert({
            id: membershipId,
            orgId: id,
            userId: user.userId,
            email: user.email,
            role: RoleSlug.make("owner"),
            status: "active",
            source: "workos",
            workosMembershipId
          })
          const actor = { type: "user", id: user.userId } as const
          yield* audit.record({ orgId: id, type: "org.created", actor, target: { type: "org", id }, data: { name } })
          yield* audit.record({ orgId: id, type: "member.joined", actor, target: { type: "member", id: membershipId }, data: { role: "owner" } })
          return { org, session: yield* workos.switchOrganization(session, workosOrgId) }
        })
      })
    })
  )
}

