import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { CreateRole } from "./org/role"
import { Action, actionImplies, BuiltinRole, builtinRolePermissions, OrgPermission } from "./rbac"

describe("rbac", () => {
  it("owners hold every permission but opt-in ones, and admins all but org:manage", () => {
    const optIn = ["resources:browse"]
    expect([...builtinRolePermissions.owner].sort()).toEqual(OrgPermission.literals.filter((p) => !optIn.includes(p)).sort())
    expect(builtinRolePermissions.admin).not.toContain("org:manage")
    expect(builtinRolePermissions.admin).toHaveLength(OrgPermission.literals.length - 1 - optIn.length)
  })

  it("resources:browse is in no builtin role", () => {
    for (const role of BuiltinRole.literals) expect(builtinRolePermissions[role]).not.toContain("resources:browse")
  })

  it("auditors can read the audit log but change nothing", () => {
    expect(builtinRolePermissions.auditor).toEqual(["resources:read", "audit:read"])
  })

  it("every builtin role has an entry", () => {
    for (const role of BuiltinRole.literals) expect(builtinRolePermissions[role].length).toBeGreaterThan(0)
  })

  it("admin ⊇ write ⊇ use ⊇ read", () => {
    const ordered = Action.literals
    ordered.forEach((granted, g) =>
      ordered.forEach((required, r) => expect(actionImplies(granted, required)).toBe(g >= r))
    )
  })

  it("custom roles cannot take a builtin slug", () => {
    const input = { name: "Ops", description: "", permissions: ["audit:read"] }
    expect(Schema.is(CreateRole)({ ...input, slug: "ops" })).toBe(true)
    expect(Schema.is(CreateRole)({ ...input, slug: "admin" })).toBe(false)
  })
})
