import { Forbidden, InvalidInput, isBuiltinRole, type Principal, type RoleSlug } from "@pc/domain"
import { Effect, Option } from "effect"
import { RolesRepo } from "./roles-repo"

/**
 * The role must exist, and only owners can hand out ownership (separation of duties: an admin cannot make
 * someone, including a person they invite, more powerful than themselves).
 */
export const assignableRole = Effect.fn("Members.assignableRole")(function*(principal: Principal, role: RoleSlug) {
  const roles = yield* RolesRepo
  if (!isBuiltinRole(role) && Option.isNone(yield* roles.find(principal.orgId, role))) {
    return yield* new InvalidInput({ message: `unknown role ${role}`, field: "role" })
  }
  if (role === "owner" && principal.role !== "owner") return yield* new Forbidden({ message: "only owners can grant the owner role" })
})
