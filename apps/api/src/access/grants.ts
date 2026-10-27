import {
  type CreateGrant,
  type Forbidden,
  type Grant,
  type GrantFilter,
  type GrantId,
  type GrantSubject,
  hasPermission,
  InvalidInput,
  isBuiltinRole,
  NotFound,
  type OrgId,
  type Principal
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { MembersRepo } from "../org/members-repo"
import { RolesRepo } from "../org/roles-repo"
import { TeamsRepo } from "../org/teams-repo"
import { Ids } from "../platform/ids"
import { ResourceVisibility } from "../resources/resource-visibility"
import { ResourcesRepo } from "../resources/resources-repo"
import { grantCreatedData } from "./creator-grant"
import { checkGrantConditions } from "./grant-conditions"
import { GrantsRepo } from "./grants-repo"
import { subjectKey, subjectsOf } from "./subjects"
import { TokensRepo } from "./tokens-repo"

const subjectEntity = { user: "member", team: "team", role: "role", service_account: "token" } as const

export class Grants extends Context.Service<Grants, {
  readonly list: (principal: Principal, filter: GrantFilter) => Effect.Effect<ReadonlyArray<Grant>, Forbidden>
  readonly create: (principal: Principal, input: CreateGrant) => Effect.Effect<Grant, Forbidden | NotFound | InvalidInput>
  readonly revoke: (principal: Principal, id: GrantId) => Effect.Effect<void, Forbidden | NotFound>
  /** Gives creators of resources made before creator grants existed the grant creation now gives. */
}>()("api/access/Grants") {
  static readonly layer = Layer.effect(
    Grants,
    Effect.gen(function*() {
      const grants = yield* GrantsRepo
      const resources = yield* ResourcesRepo
      const members = yield* MembersRepo
      const teams = yield* TeamsRepo
      const roles = yield* RolesRepo
      const tokens = yield* TokensRepo
      const audit = yield* AuditLog
      const visibility = yield* ResourceVisibility

      /**
       * Who else holds access is access-control data: without `grants:manage` or `resources:manage`, a
       * member sees only their own grants (as user, role, team or token), on resources they can see.
       */
      const ownVisible = (principal: Principal, all: ReadonlyArray<Grant>) =>
        Effect.gen(function*() {
          const mine = new Set(subjectsOf(principal).map(({ type, id }) => `${type}:${id}`))
          const own = all.filter((grant) => {
            const key = subjectKey(grant.subject)
            return mine.has(`${key.type}:${key.id}`)
          })
          if (own.length === 0) return own
          const visible = yield* visibility.visibleIds(principal, [...new Set(own.map((grant) => grant.resourceId))])
          return own.filter((grant) => visible.has(grant.resourceId))
        })

      /** A grant must name a subject that exists in the org, or it would silently grant nothing (or later, something). */
      const subjectExists = (orgId: OrgId, subject: GrantSubject): Effect.Effect<boolean> => {
        switch (subject.type) {
          case "user":
            return Effect.map(members.findByUser(orgId, subject.id), (m) => Option.isSome(m) && m.value.status === "active")
          case "team":
            return Effect.map(teams.find(orgId, subject.id), Option.isSome)
          case "role":
            return isBuiltinRole(subject.role) ? Effect.succeed(true) : Effect.map(roles.find(orgId, subject.role), Option.isSome)
          case "service_account":
            return Effect.map(tokens.find(orgId, subject.id), (t) => Option.isSome(t) && t.value.kind === "service_account")
        }
      }

      const create = Effect.fn("Grants.create")(function*(principal: Principal, input: CreateGrant) {
        yield* requirePermission(principal, "grants:manage")
        const user = yield* requireUser(principal)
        const resource = yield* resources.find(principal.orgId, input.resourceId).pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.mapError(() => new NotFound({ entity: "resource", id: input.resourceId }))
        )
        if (!(yield* subjectExists(principal.orgId, input.subject))) {
          const { type, id } = subjectKey(input.subject)
          return yield* new NotFound({ entity: subjectEntity[type], id })
        }
        yield* checkGrantConditions(resource, input.conditions)
        const now = yield* DateTime.now
        if (input.expiresAt !== null && !DateTime.isGreaterThan(input.expiresAt, now)) {
          return yield* new InvalidInput({ message: "expiresAt must be in the future", field: "expiresAt" })
        }
        const grant: Grant = { id: yield* Ids.grant, orgId: principal.orgId, ...input, createdBy: user.userId, createdAt: now, revokedAt: null }
        yield* grants.insert(grant)
        yield* audit.by(principal, "grant.created", { type: "grant", id: grant.id }, grantCreatedData(grant))
        return grant
      })

      const revoke = Effect.fn("Grants.revoke")(function*(principal: Principal, id: GrantId) {
        yield* requirePermission(principal, "grants:manage")
        const user = yield* requireUser(principal)
        if (!(yield* grants.revoke(principal.orgId, id, user.userId))) return yield* new NotFound({ entity: "grant", id })
        yield* audit.by(principal, "grant.revoked", { type: "grant", id })
      })

      return Grants.of({
        list: Effect.fn("Grants.list")(function*(principal: Principal, filter: GrantFilter) {
          yield* requirePermission(principal, "resources:read")
          const all = yield* grants.list(principal.orgId, filter)
          if (hasPermission(principal, "grants:manage") || hasPermission(principal, "resources:manage")) return all
          return yield* ownVisible(principal, all)
        }),
        create,
        revoke
      })
    })
  )
}
