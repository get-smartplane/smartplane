import { Schema } from "effect"

/** What a grant lets a subject do with a resource. Ordered: each action implies the ones before it. */
export const Action = Schema.Literals(["read", "use", "write", "admin"])
export type Action = typeof Action.Type

export const SubjectType = Schema.Literals(["user", "team", "role", "service_account"])
export type SubjectType = typeof SubjectType.Type

/** Org-level permissions: what a member may do in the dashboard. Resource access is via grants. */
export const OrgPermission = Schema.Literals([
  "org:manage",
  "members:manage",
  "teams:manage",
  "projects:manage",
  "resources:read",
  /**
   * The whole resource catalogue minus secrets, for orgs that want an open catalogue. Without it (or
   * `resources:manage`), members see only what they hold a grant on. In no builtin role by default.
   */
  "resources:browse",
  "resources:manage",
  "grants:manage",
  "guards:manage",
  "approvals:decide",
  "audit:read",
  "tokens:manage",
  /** Run periodic user access reviews (SOC 2 CC6): create campaigns, attest, revoke, export evidence. */
  "reviews:manage"
])
export type OrgPermission = typeof OrgPermission.Type

export const BuiltinRole = Schema.Literals(["owner", "admin", "auditor", "member", "viewer"])
export type BuiltinRole = typeof BuiltinRole.Type

export const isBuiltinRole = Schema.is(BuiltinRole)

/** Opt-in permissions a custom role may add; builtin roles never carry them. */
const optInPermissions: ReadonlyArray<OrgPermission> = ["resources:browse"]

const allPermissions = OrgPermission.literals.filter((permission) => !optInPermissions.includes(permission))

export const builtinRolePermissions: { readonly [R in BuiltinRole]: ReadonlyArray<OrgPermission> } = {
  owner: allPermissions,
  // Admins run the org day to day but cannot change org-wide settings or ownership.
  admin: allPermissions.filter((permission) => permission !== "org:manage"),
  // Compliance reviewers: read-only, including the audit log.
  auditor: ["resources:read", "audit:read"],
  member: ["resources:read"],
  viewer: ["resources:read"]
}

const actionRank: { readonly [A in Action]: number } = { read: 0, use: 1, write: 2, admin: 3 }

/** `admin ⊇ write ⊇ use ⊇ read`: does holding `granted` satisfy a check for `required`? */
export const actionImplies = (granted: Action, required: Action): boolean =>
  actionRank[granted] >= actionRank[required]
