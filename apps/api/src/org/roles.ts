import {
  Conflict,
  type CreateRole,
  type Forbidden,
  isBuiltinRole,
  NotFound,
  type Principal,
  type Role,
  type RoleSlug,
  type UpdateRole
} from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission } from "../auth/permissions"
import { builtinRoles } from "./builtin-roles"
import { MembersRepo } from "./members-repo"
import { RolesRepo } from "./roles-repo"

/** Custom roles are org settings, so changing them needs `org:manage`. Builtin roles are read-only. */
export class Roles extends Context.Service<Roles, {
  readonly list: (principal: Principal) => Effect.Effect<ReadonlyArray<Role>>
  readonly create: (principal: Principal, input: CreateRole) => Effect.Effect<Role, Forbidden | Conflict>
  readonly update: (principal: Principal, slug: RoleSlug, input: UpdateRole) => Effect.Effect<Role, Forbidden | NotFound | Conflict>
  readonly remove: (principal: Principal, slug: RoleSlug) => Effect.Effect<void, Forbidden | NotFound | Conflict>
}>()("api/org/Roles") {
  static readonly layer = Layer.effect(
    Roles,
    Effect.gen(function*() {
      const roles = yield* RolesRepo
      const members = yield* MembersRepo
      const audit = yield* AuditLog
      const builtinConflict = (slug: string) => new Conflict({ message: `${slug} is a builtin role and cannot be changed` })
      const load = (principal: Principal, slug: RoleSlug) =>
        roles.find(principal.orgId, slug).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "role", id: slug })))

      return Roles.of({
        list: Effect.fn("Roles.list")(function*(principal: Principal) {
          return [...builtinRoles, ...(yield* roles.list(principal.orgId))]
        }),
        create: Effect.fn("Roles.create")(function*(principal: Principal, input: CreateRole) {
          yield* requirePermission(principal, "org:manage")
          yield* roles.insert(principal.orgId, input)
          yield* audit.by(principal, "role.created", { type: "role", id: input.slug }, { permissions: input.permissions })
          const role: Role = { ...input, builtin: false }
          return role
        }),
        update: Effect.fn("Roles.update")(function*(principal: Principal, slug: RoleSlug, input: UpdateRole) {
          yield* requirePermission(principal, "org:manage")
          if (isBuiltinRole(slug)) return yield* builtinConflict(slug)
          yield* load(principal, slug)
          yield* roles.update(principal.orgId, slug, input)
          yield* audit.by(principal, "role.updated", { type: "role", id: slug }, input)
          return yield* load(principal, slug)
        }),
        remove: Effect.fn("Roles.remove")(function*(principal: Principal, slug: RoleSlug) {
          yield* requirePermission(principal, "org:manage")
          if (isBuiltinRole(slug)) return yield* builtinConflict(slug)
          yield* load(principal, slug)
          const assigned = yield* members.countWithRole(principal.orgId, slug)
          if (assigned > 0) return yield* new Conflict({ message: `role ${slug} is still assigned to ${assigned} member(s)` })
          yield* roles.remove(principal.orgId, slug)
          yield* audit.by(principal, "role.deleted", { type: "role", id: slug })
        })
      })
    })
  )
}
