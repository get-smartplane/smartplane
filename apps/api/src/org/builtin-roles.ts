import { BuiltinRole, builtinRolePermissions, Role, RoleSlug } from "@pc/domain"

const descriptions: { readonly [R in BuiltinRole]: readonly [name: string, description: string] } = {
  owner: ["Owner", "Full control, including org settings and ownership."],
  admin: ["Admin", "Runs the org day to day; cannot change org-wide settings."],
  auditor: ["Auditor", "Read-only access, including the audit log."],
  member: ["Member", "Uses the resources granted to them."],
  viewer: ["Viewer", "Read-only access to resources."]
}

export const builtinRoles: ReadonlyArray<Role> = BuiltinRole.literals.map((slug) => ({
  slug: RoleSlug.make(slug),
  name: descriptions[slug][0],
  description: descriptions[slug][1],
  permissions: builtinRolePermissions[slug],
  builtin: true
}))
