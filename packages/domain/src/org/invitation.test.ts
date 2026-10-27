import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { InviteWithAccess } from "./invitation"

const decode = Schema.decodeUnknownExit(InviteWithAccess)
const valid = (input: unknown) => decode(input)._tag === "Success"
const grant = { resourceId: "res_variable01", action: "use", conditions: {}, expiresAt: null }
const base = { emails: ["ada@example.com"], role: "member", access: { teamIds: ["team_platform1"], grants: [grant] } }

describe("InviteWithAccess", () => {
  it("takes one or more distinct emails, compared without case", () => {
    expect(valid(base)).toBe(true)
    expect(valid({ ...base, emails: ["ada@example.com", "grace@example.com"] })).toBe(true)
    expect(valid({ ...base, emails: [] })).toBe(false)
    expect(valid({ ...base, emails: ["ada@example.com", "ADA@example.com"] })).toBe(false)
    expect(valid({ ...base, emails: ["not-an-email"] })).toBe(false)
    expect(valid({ ...base, emails: Array.from({ length: 51 }, (_, n) => `p${n}@example.com`) })).toBe(false)
  })

  it("lists each team once and only grants with a level the domain knows", () => {
    expect(valid({ ...base, access: { teamIds: ["team_platform1", "team_platform1"], grants: [] } })).toBe(false)
    expect(valid({ ...base, access: { teamIds: [], grants: [{ ...grant, action: "own" }] } })).toBe(false)
    expect(valid({ ...base, access: { teamIds: [], grants: [] } })).toBe(true)
  })
})
