import { DateTime } from "effect"
import { describe, expect, it } from "vitest"
import { GrantId, OrgId, ResourceId, TeamId, UserId } from "../ids"
import { isCreatorGrant } from "./creator-grant"
import type { Grant } from "./grant"

const ada = UserId.make("usr_ada0000001")
const eve = UserId.make("usr_eve0000001")
const resource = { id: ResourceId.make("res_linear0001"), createdBy: ada }
const at = DateTime.makeUnsafe("2026-10-01T00:00:00.000Z")
const grant: Grant = {
  id: GrantId.make("grt_creator001"),
  orgId: OrgId.make("org_acme000001"),
  subject: { type: "user", id: ada },
  resourceId: resource.id,
  action: "admin",
  conditions: {},
  expiresAt: null,
  createdBy: ada,
  createdAt: at,
  revokedAt: null
}

describe("isCreatorGrant", () => {
  it("recognises the creator's unconditional admin grant and nothing else", () => {
    expect(isCreatorGrant(grant, resource)).toBe(true)
    expect(isCreatorGrant(grant, undefined)).toBe(false)
    expect(isCreatorGrant(grant, { ...resource, createdBy: eve })).toBe(false)
    expect(isCreatorGrant({ ...grant, action: "use" }, resource)).toBe(false)
    expect(isCreatorGrant({ ...grant, createdBy: eve }, resource)).toBe(false)
    expect(isCreatorGrant({ ...grant, expiresAt: at }, resource)).toBe(false)
    expect(isCreatorGrant({ ...grant, conditions: { tools: ["search"] } }, resource)).toBe(false)
    expect(isCreatorGrant({ ...grant, subject: { type: "team", id: TeamId.make("team_platform1") } }, resource)).toBe(false)
  })
})
