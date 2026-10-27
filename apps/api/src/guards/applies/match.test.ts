import { assert, describe, it } from "@effect/vitest"
import { type GuardApplies, ResourceId, RoleSlug, TeamId, UserId } from "@pc/domain"
import { userPrincipal } from "../../testing/fixtures"
import { type CallFacts, covers } from "./match"

const notion = ResourceId.make("res_notion0001")
const github = ResourceId.make("res_github0001")
const finance = TeamId.make("team_finance01")
const contractors = TeamId.make("team_contract1")

const call = (overrides: Partial<CallFacts> = {}): CallFacts => ({
  resourceId: notion,
  tool: "notion-update-page",
  access: "destructive",
  principal: userPrincipal(),
  ...overrides
})

describe("covers: each dimension of a guard's call filter", () => {
  it("no accepted filter covers every call (today's behaviour)", () => {
    assert.isTrue(covers(null, call({ resourceId: github, access: "read" })))
  })

  it("resources: only calls to the named resources; empty names every resource", () => {
    const applies: GuardApplies = { resourceIds: [notion] }
    assert.isTrue(covers(applies, call()))
    assert.isFalse(covers(applies, call({ resourceId: github })))
    assert.isTrue(covers({ resourceIds: [] }, call({ resourceId: github })))
  })

  it("tools: named tools are in, tools verify saw and left out are out, on that resource only", () => {
    const applies: GuardApplies = { resourceIds: [notion], tools: [{ resourceId: notion, only: ["notion-update-page", "notion-create-pages"], known: ["notion-update-page", "notion-create-pages", "notion-fetch", "notion-search"] }] }
    assert.isTrue(covers(applies, call()))
    assert.isTrue(covers(applies, call({ tool: "notion-create-pages", access: "write" })))
    assert.isFalse(covers(applies, call({ tool: "notion-search", access: "read" })))
    assert.isFalse(covers(applies, call({ tool: "notion-fetch", access: "unknown" })))
  })

  it("a tool the server added after verify is still checked, matched by resource and operation class", () => {
    const applies: GuardApplies = { resourceIds: [notion], operations: "changes", tools: [{ resourceId: notion, only: ["notion-update-page"], known: ["notion-update-page", "notion-fetch"] }] }
    assert.isTrue(covers(applies, call({ tool: "notion-bulk-archive", access: "destructive" })))
    // A new read-only tool falls to the operation filter, not the tool list.
    assert.isFalse(covers(applies, call({ tool: "notion-export", access: "read" })))
  })

  it("operations: only tools that may change something; unknown or missing access counts as a change", () => {
    const applies: GuardApplies = { resourceIds: [], operations: "changes" }
    assert.isFalse(covers(applies, call({ access: "read" })))
    assert.isTrue(covers(applies, call({ access: "write" })))
    assert.isTrue(covers(applies, call({ access: "destructive" })))
    assert.isTrue(covers(applies, call({ access: "unknown" })))
    assert.isTrue(covers(applies, call({ access: undefined })))
  })

  it("actors only: “contractors can't push” checks contractors' calls and nobody else's", () => {
    const applies: GuardApplies = { resourceIds: [github], actors: { kind: "only", refs: [{ _tag: "Team", teamId: contractors }] } }
    assert.isTrue(covers(applies, call({ resourceId: github, principal: userPrincipal({ teamIds: [contractors] }) })))
    assert.isFalse(covers(applies, call({ resourceId: github, principal: userPrincipal({ teamIds: [finance] }) })))
  })

  it("actors except: “only finance can send” checks everyone except finance, who are allowed outright", () => {
    const applies: GuardApplies = { resourceIds: [], actors: { kind: "except", refs: [{ _tag: "Team", teamId: finance }] } }
    assert.isFalse(covers(applies, call({ principal: userPrincipal({ teamIds: [finance] }) })))
    assert.isTrue(covers(applies, call({ principal: userPrincipal({ teamIds: [contractors] }) })))
    assert.isTrue(covers(applies, call({ principal: userPrincipal() })))
  })

  it("actors by role and by person", () => {
    const byRole: GuardApplies = { resourceIds: [], actors: { kind: "only", refs: [{ _tag: "Role", role: RoleSlug.make("member") }] } }
    assert.isTrue(covers(byRole, call()))
    assert.isFalse(covers(byRole, call({ principal: userPrincipal({ role: RoleSlug.make("admin") }) })))
    const dana = UserId.make("usr_dana00001")
    const byPerson: GuardApplies = { resourceIds: [], actors: { kind: "except", refs: [{ _tag: "User", userId: dana }] } }
    assert.isFalse(covers(byPerson, call({ principal: userPrincipal({ userId: dana }) })))
    assert.isTrue(covers(byPerson, call()))
  })

  it("fails closed: a filter it cannot evaluate covers the call", () => {
    const broken: unknown = { resourceIds: [], tools: "not-a-list" }
    // Only reachable through a bug or a row from a future version: the guard is then checked, never skipped.
    assert.isTrue(covers(broken as GuardApplies, call()))
    const unknownKind: unknown = { resourceIds: [], actors: { kind: "maybe", refs: [{ _tag: "Team", teamId: finance }] } }
    assert.isTrue(covers(unknownKind as GuardApplies, call()))
  })
})
