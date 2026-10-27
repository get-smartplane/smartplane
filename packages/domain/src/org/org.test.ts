import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { AccessReviewScope, DecideReviewItem } from "../access/review"
import { builtinRolePermissions } from "../rbac"
import { AdminPortalLinkRequest, UpdateOrg } from "./org"

describe("org settings and access reviews", () => {
  it("keeps audit retention between one and ten years", () => {
    const valid = Schema.is(UpdateOrg)
    expect(valid({ auditRetentionDays: 365 })).toBe(true)
    expect(valid({ auditRetentionDays: 3650 })).toBe(true)
    expect(valid({ auditRetentionDays: 90 })).toBe(false)
    expect(valid({ auditRetentionDays: 3651 })).toBe(false)
  })

  it("takes a tool search threshold: always (0), never (null) or above N", () => {
    const valid = Schema.is(UpdateOrg)
    expect(valid({ toolSearchThreshold: 0 })).toBe(true)
    expect(valid({ toolSearchThreshold: null })).toBe(true)
    expect(valid({ toolSearchThreshold: 40 })).toBe(true)
    expect(valid({ toolSearchThreshold: -1 })).toBe(false)
    expect(valid({ toolSearchThreshold: 2.5 })).toBe(false)
  })

  it("only offers the supported Admin Portal intents", () => {
    expect(Schema.is(AdminPortalLinkRequest)({ intent: "sso" })).toBe(true)
    expect(Schema.is(AdminPortalLinkRequest)({ intent: "bring_your_own_key" })).toBe(false)
  })

  it("lets owners and admins, but not auditors, run access reviews", () => {
    expect(builtinRolePermissions.owner).toContain("reviews:manage")
    expect(builtinRolePermissions.admin).toContain("reviews:manage")
    expect(builtinRolePermissions.auditor).not.toContain("reviews:manage")
  })

  it("scopes reviews to the org or a project and decides keep or revoke", () => {
    expect(Schema.is(AccessReviewScope)({ type: "project", projectId: "prj_abcdefgh" })).toBe(true)
    expect(Schema.is(AccessReviewScope)({ type: "team" })).toBe(false)
    expect(Schema.is(DecideReviewItem)({ decision: "revoke", comment: "left the team" })).toBe(true)
    expect(Schema.is(DecideReviewItem)({ decision: "maybe" })).toBe(false)
  })
})
