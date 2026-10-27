import { assert, describe, it } from "@effect/vitest"
import { type GuardApplies, ResourceId, TeamId, type ToolAccess } from "@pc/domain"
import { userPrincipal } from "../../testing/fixtures"
import { covers } from "./match"

/**
 * The expected drop in Clef calls, on a model org (assumptions, not measured traffic): four systems, agent
 * calls mostly reads (75%: agents search and fetch before they change anything), 10% of calls by contractors
 * and 10% by finance, and four typical rules. Today each of those rules is unscoped, so every call is
 * classified with all four questions.
 */
const notion = ResourceId.make("res_notion0001")
const github = ResourceId.make("res_github0001")
const gmail = ResourceId.make("res_gmail00001")
const linear = ResourceId.make("res_linear0001")
const finance = TeamId.make("team_finance01")
const contractors = TeamId.make("team_contract1")

interface Tool { readonly resourceId: ResourceId; readonly name: string; readonly access: ToolAccess }
const toolsOf = (resourceId: ResourceId, reads: number, writes: ReadonlyArray<string>): ReadonlyArray<Tool> => [
  ...Array.from({ length: reads }, (_, n) => ({ resourceId, name: `read-${n}`, access: "read" as const })),
  ...writes.map((name) => ({ resourceId, name, access: "destructive" as const }))
]
const systems = [
  { share: 0.35, tools: toolsOf(notion, 6, ["notion-update-page", "notion-create-pages", "notion-delete-pages", "notion-move-pages", "notion-duplicate-page", "notion-create-comment", "notion-create-database", "notion-update-data-source"]) },
  { share: 0.35, tools: toolsOf(github, 6, ["push_files", "create_or_update_file", "create_pull_request", "merge_pull_request"]) },
  { share: 0.15, tools: toolsOf(gmail, 2, ["send_email", "create_draft"]) },
  { share: 0.15, tools: toolsOf(linear, 3, ["create_issue", "update_issue", "delete_issue"]) }
]
const callers = [{ share: 0.1, teamIds: [contractors] }, { share: 0.1, teamIds: [finance] }, { share: 0.8, teamIds: [] }]
const ReadShare = 0.75

const rules: ReadonlyArray<GuardApplies> = [
  // "nobody can update todo list in notion"
  { resourceIds: [notion], operations: "changes", tools: [{ resourceId: notion, only: ["notion-update-page", "notion-create-pages", "notion-delete-pages", "notion-move-pages"], known: systems[0]!.tools.map((t) => t.name) }] },
  // "contractors can't push to GitHub"
  { resourceIds: [github], operations: "changes", actors: { kind: "only", refs: [{ _tag: "Team", teamId: contractors }] } },
  // "only finance can send email from the billing@ Gmail"
  { resourceIds: [gmail], operations: "changes", actors: { kind: "except", refs: [{ _tag: "Team", teamId: finance }] } },
  // "never delete Linear issues"
  { resourceIds: [linear], operations: "changes", tools: [{ resourceId: linear, only: ["delete_issue"], known: systems[3]!.tools.map((t) => t.name) }] }
]

/** Share of calls that reach Clef, and questions per call on average, for a set of filters. */
const measure = (filters: ReadonlyArray<GuardApplies | null>) => {
  let classified = 0
  let questions = 0
  for (const system of systems) {
    const reads = system.tools.filter((tool) => tool.access === "read")
    const writes = system.tools.filter((tool) => tool.access !== "read")
    const weighted = [...reads.map((tool) => [tool, ReadShare / reads.length] as const), ...writes.map((tool) => [tool, (1 - ReadShare) / writes.length] as const)]
    for (const [tool, toolShare] of weighted) {
      for (const caller of callers) {
        const share = system.share * toolShare * caller.share
        const matched = filters.filter((applies) => covers(applies, { resourceId: tool.resourceId, tool: tool.name, access: tool.access, principal: userPrincipal({ teamIds: caller.teamIds }) })).length
        if (matched > 0) classified += share
        questions += share * matched
      }
    }
  }
  return { classified, questions }
}

describe("expected Clef call reduction", () => {
  it("four typical rules: from every call classified to about one in ten", () => {
    const today = measure(rules.map(() => null))
    const filtered = measure(rules)
    assert.closeTo(today.classified, 1, 1e-9)
    assert.closeTo(today.questions, 4, 1e-9)
    // Notion writes the rule names (4 of 8) + contractors' GitHub writes + non-finance Gmail sends + Linear deletes.
    assert.closeTo(filtered.classified, 0.35 * 0.25 * 0.5 + 0.35 * 0.25 * 0.1 + 0.15 * 0.25 * 0.9 + 0.15 * 0.25 / 3, 1e-9)
    assert.isBelow(filtered.classified, 0.1)
    assert.isBelow(filtered.questions, 0.1)
  })

  it("one rule about anything still sends every call, but with a single question instead of five", () => {
    const filtered = measure([...rules, null])
    assert.closeTo(filtered.classified, 1, 1e-9)
    assert.isBelow(filtered.questions, 1.1)
    assert.closeTo(measure([...rules.map(() => null), null]).questions, 5, 1e-9)
  })
})
