import { type GuardApplies, type GuardGrounding, ResourceId, TeamId } from "@pc/domain"
import { describe, expect, it } from "vitest"
import { dimensionsOf, listWords, toolLabel, toolWords, without } from "./applies-words"

const notion = ResourceId.make("res_notion0001")
const grounding: GuardGrounding = { targets: [{ resourceId: notion, name: "Notion", product: "Notion", matched: "alias", mention: "notion", tools: "curated", toolCount: 4 }], unknown: [], tools: [] }
const applies: GuardApplies = {
  resourceIds: [notion],
  tools: [{ resourceId: notion, only: ["notion-update-page", "notion-create-pages"], known: ["notion-update-page", "notion-create-pages", "notion-fetch", "notion-delete-pages"] }],
  operations: "changes",
  actors: { kind: "except", refs: [{ _tag: "Team", teamId: TeamId.make("team_finance01") }] }
}

describe("the call filter in plain words", () => {
  it("names tools as words and lists the ones it leaves out", () => {
    expect(toolLabel("notion-update-page", "Notion")).toBe("update page")
    expect(toolLabel("push_files")).toBe("push files")
    expect(listWords(["a", "b", "c"])).toBe("a, b and c")
    expect(toolWords(applies.tools![0]!, grounding)).toEqual({ checks: "update page and create pages", skips: "fetch and delete pages" })
    expect(toolWords(applies.tools![0]!, grounding, true).checks).toBe("update page and create pages on Notion")
  })

  it("editing drops one dimension at a time; dropping the systems drops their tool lists", () => {
    expect(dimensionsOf(applies)).toEqual(["resources", "tools", "operations", "actors"])
    expect(dimensionsOf(without(applies, "actors"))).toEqual(["resources", "tools", "operations"])
    expect(without(applies, "resources")).toEqual({ resourceIds: [], operations: "changes", actors: applies.actors })
  })
})
