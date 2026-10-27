import { type AuditEvent, type InviteAccess, type InviteGrant, type InviteWithAccess, ResourceId, RoleSlug, TeamId, UpstreamFailure } from "@pc/domain"
import { DateTime, Effect, Layer, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { AuditLog } from "../audit/audit-log"
import { SignIn } from "../auth/sign-in"
import { UsersRepo } from "../auth/users-repo"
import { WorkOS } from "../auth/workos"
import { ConnectionsRepo } from "../connections/connections-repo"
import { InvitationAcceptance } from "../org/invitation-acceptance"
import { Invitations } from "../org/invitations"
import { InviteAccessRepo } from "../org/invite-access-repo"
import { MembersRepo } from "../org/members-repo"
import { Offboarding } from "../org/offboarding"
import { OrgsRepo } from "../org/orgs-repo"
import { RolesRepo } from "../org/roles-repo"
import { TeamsRepo } from "../org/teams-repo"
import { ResourcesRepo } from "../resources/resources-repo"
import { Provisioning } from "../webhooks/provisioning"
import { TestDatabase } from "./database"
import { now, userPrincipal } from "./fixtures"
import { memoryAuditQueue, seedOrg, seedResource, selectRows } from "./seed"

const unused = () => Effect.die("not used by these tests")

/** Records the invitations it sends; `failFor` makes WorkOS refuse that one address. */
const fakeWorkOS = (sent: Array<string>, failFor?: string) =>
  Layer.succeed(WorkOS, WorkOS.of({
    sendInvitation: (_org, email) =>
      email === failFor
        ? Effect.fail(new UpstreamFailure({ upstream: "workos", message: "unavailable" }))
        : Effect.sync(() => (sent.push(email), `inv_${sent.length}`)),
    authorizationUrl: () => "",
    exchangeCode: unused,
    authenticate: unused,
    switchOrganization: unused,
    logoutUrl: unused,
    createOrganization: unused,
    createMembership: unused,
    verifyWebhook: () => Effect.succeed(false)
  }))

/** Inviting, accepting (by sign-in or webhook) and offboarding, over one in-memory database. */
export const invitationWorld = (events: Array<AuditEvent>, sent: Array<string>, failFor?: string) =>
  Layer.mergeAll(Invitations.layer, SignIn.layer, Provisioning.layer).pipe(
    Layer.provideMerge(Offboarding.layer),
    Layer.provideMerge(InvitationAcceptance.layer),
    Layer.provideMerge(Layer.mergeAll(
      MembersRepo.layer, OrgsRepo.layer, UsersRepo.layer, RolesRepo.layer, TeamsRepo.layer, ResourcesRepo.layer, InviteAccessRepo.layer, ConnectionsRepo.layer
    )),
    Layer.provideMerge(Layer.merge(AuditLog.layer.pipe(Layer.provide(memoryAuditQueue(events))), fakeWorkOS(sent, failFor))),
    Layer.provideMerge(TestDatabase)
  )

export const admin = userPrincipal({
  role: RoleSlug.make("admin"),
  permissions: ["members:manage", "teams:manage", "grants:manage", "resources:read"]
})
export const backend = TeamId.make("team_testteam1")
export const variable = ResourceId.make("res_variable01")
export const useGrant: InviteGrant = { resourceId: variable, action: "use", conditions: {}, expiresAt: DateTime.add(now, { days: 30 }) }
export const access: InviteAccess = { teamIds: [backend], grants: [useGrant] }
export const inviteInput = (overrides: Partial<InviteWithAccess> = {}): InviteWithAccess => ({
  emails: ["grace@example.com", "linus@example.com"],
  role: RoleSlug.make("member"),
  access,
  ...overrides
})

/** `seedOrg` (Ada, team Backend) plus one resource to grant, at the fixed test time. */
export const seedInvitations = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  yield* seedResource("res_variable01")
})

export const count = (query: string, ...params: Array<unknown>) =>
  selectRows(`SELECT COUNT(*) AS n FROM ${query}`, ...params).pipe(Effect.map((rows) => rows[0]?.n))

/** The invitee signs in through AuthKit for the first time, which accepts the invitation. */
export const signIn = (email: string) =>
  SignIn.use((signIn) =>
    signIn.complete({
      user: { id: `wos_${email}`, email },
      organizationId: "org_workos",
      sealedSession: Redacted.make("sealed"),
      authenticationMethod: "Password"
    }))

export const userIdOf = (email: string) =>
  selectRows("SELECT id FROM users WHERE email = ?", email).pipe(Effect.map((rows) => String(rows[0]?.id)))
