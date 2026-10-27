import { type OrgId, RoleSlug, type UserId } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { systemActor } from "../audit/actor"
import { UsersRepo } from "../auth/users-repo"
import { InvitationAcceptance } from "../org/invitation-acceptance"
import { MembersRepo } from "../org/members-repo"
import { Offboarding } from "../org/offboarding"
import { OrgsRepo } from "../org/orgs-repo"
import { Ids } from "../platform/ids"
import { directoryEmails, type WorkosEvent } from "./workos-events"

/**
 * Applies WorkOS membership and directory events. Every removal goes through `deprovisionMember`, so an
 * HR-system deactivation cuts agent access without anyone touching this app.
 */
export class Provisioning extends Context.Service<Provisioning, {
  readonly apply: (event: WorkosEvent) => Effect.Effect<void>
}>()("api/webhooks/Provisioning") {
  static readonly layer = Layer.effect(
    Provisioning,
    Effect.gen(function*() {
      const orgs = yield* OrgsRepo
      const users = yield* UsersRepo
      const members = yield* MembersRepo
      const offboarding = yield* Offboarding
      const acceptance = yield* InvitationAcceptance

      const offboard = (orgId: OrgId, userId: UserId, subsystem: string, reason: string) =>
        Effect.flatMap(members.findByUser(orgId, userId), (member) =>
          Option.isNone(member)
            ? Effect.void
            : offboarding.deprovisionMember(orgId, member.value.id, systemActor(subsystem), reason).pipe(Effect.ignore))

      const resolve = (workosOrgId: string, workosUserId: string) =>
        Effect.all([orgs.findByWorkosId(workosOrgId), users.findByWorkosId(workosUserId)]).pipe(
          Effect.map(([org, user]) => (Option.isSome(org) && Option.isSome(user) ? Option.some({ orgId: org.value.id, userId: user.value.id, email: user.value.email }) : Option.none()))
        )

      const membership = Effect.fn("Provisioning.membership")(function*(event: Extract<WorkosEvent, { data: { user_id: string } }>) {
        const found = yield* resolve(event.data.organization_id, event.data.user_id)
        // Users who never signed in are mirrored on their first login, which then accepts the membership.
        if (Option.isNone(found)) return
        const { orgId, userId, email } = found.value
        if (event.event === "organization_membership.deleted" || event.data.status === "inactive") {
          return yield* offboard(orgId, userId, "workos", event.event === "organization_membership.deleted" ? "membership_deleted" : "membership_inactive")
        }
        if (event.data.status !== "active") return
        const existing = yield* members.findByUser(orgId, userId)
        if (Option.isSome(existing)) {
          const kind = event.event === "organization_membership.created" ? "created" : "updated"
          // A member removed in Smartplane keeps an active WorkOS membership; its routine `updated` events must not undo the removal.
          if (!(yield* members.activateFromWorkos(existing.value.id, userId, event.data.id, kind))) {
            yield* Effect.logInfo("provisioning: WorkOS reports an active membership for a member removed in Smartplane; left removed")
          }
          return
        }
        // An invitation accepted in WorkOS: the pending membership has no user yet, so it is found by email.
        const invited = yield* members.findByEmail(orgId, email)
        if (Option.isSome(invited) && invited.value.status === "invited") {
          return yield* acceptance.accept(orgId, invited.value.id, userId, event.data.id)
        }
        yield* members.insert({
          id: yield* Ids.membership,
          orgId,
          userId,
          email,
          role: RoleSlug.make(event.data.role?.slug === "admin" ? "admin" : "member"),
          status: "active",
          source: "workos",
          workosMembershipId: event.data.id
        }).pipe(Effect.ignore)
      })

      return Provisioning.of({
        apply: Effect.fn("Provisioning.apply")(function*(event: WorkosEvent) {
          yield* Effect.annotateCurrentSpan({ "workos.event": event.event })
          switch (event.event) {
            case "organization_membership.created":
            case "organization_membership.updated":
            case "organization_membership.deleted":
              return yield* membership(event)
            case "dsync.user.updated":
            case "dsync.user.deleted": {
              if (event.event === "dsync.user.updated" && event.data.state === "active") return
              const orgId = event.data.organization_id
              if (!orgId) return
              const org = yield* orgs.findByWorkosId(orgId)
              if (Option.isNone(org)) return
              const userIds = yield* Effect.forEach(directoryEmails(event.data), (email) => users.findByEmail(email))
              yield* Effect.forEach(new Set(userIds.flat()), (userId) => offboard(org.value.id, userId, "scim", `scim_${event.event}`), { discard: true })
              return
            }
            case "user.deleted": {
              const user = yield* users.findByWorkosId(event.data.id)
              if (Option.isNone(user)) return
              yield* users.markDeprovisioned(user.value.id)
              const memberships = yield* members.activeMembershipsOf(user.value.id)
              yield* Effect.forEach(memberships, ({ orgId }) => offboard(orgId, user.value.id, "workos", "user_deleted"), { discard: true })
            }
          }
        })
      })
    })
  )
}
