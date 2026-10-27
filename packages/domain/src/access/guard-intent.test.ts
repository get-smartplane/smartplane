import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { RoleSlug, TeamId } from "../ids"
import { Name } from "../primitives"
import { CompiledGuard } from "./guard"
import { sameApprovers, uniqueApprovers } from "./guard-intent"
import { nameFromRule } from "./guard-name"

describe("nameFromRule", () => {
  it("takes the first sentence and always fits a Name", () => {
    expect(nameFromRule("Nobody deletes reports from the Q3 folder. Ask Dana first.")).toBe("Nobody deletes reports from the Q3 folder")
    expect(nameFromRule("  nobody creates issues on linear without my permission  ")).toBe("nobody creates issues on linear without my permission")
    const long = nameFromRule("x ".repeat(200))
    expect(Schema.is(Name)(long)).toBe(true)
    expect(long.endsWith("…")).toBe(true)
  })
})

describe("approvers", () => {
  const admin = { _tag: "Role", role: RoleSlug.make("admin") } as const
  const team = { _tag: "Team", teamId: TeamId.make("team_security1") } as const
  it("compare as sets and deduplicate", () => {
    expect(sameApprovers([admin, team], [team, admin, admin])).toBe(true)
    expect(sameApprovers([admin], [{ _tag: "Author" }])).toBe(false)
    expect(uniqueApprovers([admin, admin, team])).toEqual([admin, team])
  })
})

describe("CompiledGuard", () => {
  it("still decodes drafts stored before suggestions existed", () => {
    const decoded = Schema.decodeUnknownSync(CompiledGuard)({ instructions: "Does this action delete a Q3 report?", examples: [] })
    expect(decoded.suggestion).toBeUndefined()
  })
})
