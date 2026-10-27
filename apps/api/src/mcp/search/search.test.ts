import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { resourceOf } from "../../testing/gateway-fakes"
import type { GatewayTool } from "../provider"
import { textResult } from "../sdk"
import { usesSearch } from "./mode"
import { searchTools } from "./rank"
import { suggestNames, unknownToolText } from "./suggest"

const linear = resourceOf("res_linear0001", "Linear", { kind: "variable", value: "x" })
const github = resourceOf("res_github0001", "GitHub", { kind: "variable", value: "x" })

const tool = (name: string, description: string, target: GatewayTool["target"], readOnly?: boolean): GatewayTool => ({
  definition: {
    name,
    description,
    inputSchema: { type: "object" },
    ...(readOnly === undefined ? {} : { annotations: { readOnlyHint: readOnly } })
  },
  target,
  operation: name,
  prepare: () => Effect.succeed({ arguments: {}, execute: Effect.succeed(textResult("ok")) })
})

const catalog = [
  tool("linear__create_issue", "Create a new issue in a team", linear, false),
  tool("linear__list_issues", "List issues, filtered by team or state", linear, true),
  tool("linear__delete_issue", "Delete an issue", linear, false),
  tool("github__list_pull_requests", "List pull requests of a repository", github, true),
  tool("github__create_pull_request", "Open a pull request", github, false),
  tool("skills_list", "List the skills you can use", null, true)
]
const names = (query: string, server?: string) => searchTools(catalog, query, { server, limit: 3 }).tools.map((found) => found.definition.name)

describe("usesSearch", () => {
  it("switches above the threshold, never with no threshold, and the header wins", () => {
    expect(usesSearch(41, 40, undefined)).toBe(true)
    expect(usesSearch(40, 40, undefined)).toBe(false)
    expect(usesSearch(500, null, undefined)).toBe(false)
    expect(usesSearch(1, 0, undefined)).toBe(true)
    expect(usesSearch(500, 40, "all")).toBe(false)
    expect(usesSearch(2, 40, "search")).toBe(true)
  })
})

describe("searchTools", () => {
  it("ranks by what the tool does, with the verb deciding read or write", () => {
    expect(names("create linear issue")[0]).toBe("linear__create_issue")
    expect(names("list issues")[0]).toBe("linear__list_issues")
    expect(names("open pull requests")).toContain("github__create_pull_request")
  })

  it("narrows to a server by slug or product name", () => {
    expect(names("list", "github")).toEqual(["github__list_pull_requests"])
  })

  it("browses every tool by name when the query has no meaningful words", () => {
    const browsed = searchTools(catalog, "the tools", { limit: 2 })
    expect(browsed.total).toBe(catalog.length)
    expect(browsed.tools).toHaveLength(2)
  })

  it("finds nothing for unrelated words, and ranks the same way every time", () => {
    expect(searchTools(catalog, "zebra quantum", { limit: 5 }).total).toBe(0)
    expect(names("issue")).toEqual(names("issue"))
  })
})

describe("suggestNames", () => {
  it("suggests close names from the caller's own catalog only", () => {
    expect(suggestNames(catalog, "linear__create_issues")[0]).toBe("linear__create_issue")
    expect(suggestNames(catalog, "linaer__crate_isue")).toContain("linear__create_issue")
    expect(unknownToolText("x", [])).not.toContain("Did you mean")
  })
})
