import { Schema } from "effect"
import { RoleSlug } from "../ids"
import { Description, Name } from "../primitives"
import { isBuiltinRole, OrgPermission } from "../rbac"

/** Builtin and custom roles share one shape; builtin ones are read-only. */
export class Role extends Schema.Opaque<Role>()(
  Schema.Struct({
    slug: RoleSlug,
    name: Name,
    description: Description,
    permissions: Schema.Array(OrgPermission),
    builtin: Schema.Boolean
  }).annotate({ identifier: "Role" })
) {}

export const CustomRoleSlug = RoleSlug.check(
  Schema.makeFilter((slug: string) => !isBuiltinRole(slug), { expected: "a slug that is not a builtin role" })
)

export const CreateRole = Schema.Struct({
  slug: CustomRoleSlug,
  name: Name,
  description: Description,
  permissions: Schema.Array(OrgPermission)
}).annotate({ identifier: "CreateRole" })
export type CreateRole = typeof CreateRole.Type

export const UpdateRole = Schema.Struct({
  name: Schema.optionalKey(Name),
  description: Schema.optionalKey(Description),
  permissions: Schema.optionalKey(Schema.Array(OrgPermission))
}).annotate({ identifier: "UpdateRole" })
export type UpdateRole = typeof UpdateRole.Type
