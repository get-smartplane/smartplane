import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { OrgId, RoleSlug, TeamId, UserId } from "./ids"

describe("branded ids", () => {
  it("accepts ids with their own prefix", () => {
    expect(Schema.decodeUnknownSync(TeamId)("team_01HZX3K9QW")).toBe("team_01HZX3K9QW")
    expect(Schema.is(OrgId)("org_abcdefgh")).toBe(true)
  })

  it("rejects ids with another table's prefix", () => {
    expect(Schema.is(UserId)("team_01HZX3K9QW")).toBe(false)
    expect(Schema.is(TeamId)("usr_01HZX3K9QW")).toBe(false)
  })

  it("rejects malformed ids", () => {
    for (const id of ["org_", "org_short", "org_has space1", "ORG_abcdefgh", "orgabcdefgh"]) {
      expect(Schema.is(OrgId)(id)).toBe(false)
    }
  })

  it("validates role slugs", () => {
    expect(Schema.is(RoleSlug)("owner")).toBe(true)
    expect(Schema.is(RoleSlug)("data-team-lead")).toBe(true)
    expect(Schema.is(RoleSlug)("Data Team")).toBe(false)
  })
})
