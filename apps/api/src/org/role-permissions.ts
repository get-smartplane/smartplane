import { builtinRolePermissions, isBuiltinRole, type OrgId, type OrgPermission, type RoleSlug } from "@pc/domain"
import { Effect, Option } from "effect"
import { RolesRepo } from "./roles-repo"

const builtinPermissions = (role: string): ReadonlyArray<OrgPermission> | undefined =>
  isBuiltinRole(role) ? builtinRolePermissions[role] : undefined

/** Resolves a role slug to its permissions. An unknown custom role grants nothing (fail closed). */
export const permissionsOf = (orgId: OrgId, role: RoleSlug): Effect.Effect<ReadonlyArray<OrgPermission>, never, RolesRepo> => {
  const builtin = builtinPermissions(role)
  if (builtin !== undefined) return Effect.succeed(builtin)
  return RolesRepo.use((roles) => roles.find(orgId, role)).pipe(
    Effect.map(Option.match({ onNone: () => [], onSome: (found) => found.permissions }))
  )
}
