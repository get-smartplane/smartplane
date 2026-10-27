import { assert, describe, it } from "@effect/vitest"
import { PieceId, type ResourceConfig } from "@pc/domain"
import { resourceOf } from "../../testing/gateway-fakes"
import { matchTargets } from "./targets"

const notion = resourceOf("res_notion0001", "Team wiki", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http", accountMode: "per_user" })
const atlassian = resourceOf("res_atlass001", "Atlassian", { kind: "mcp_server", url: "https://mcp.atlassian.com/v2/mcp", transport: "streamable_http" })
const integration = (pieceId: string): ResourceConfig => ({ kind: "integration", pieceId: PieceId.make(pieceId), connection: { type: "none" } })
const github = resourceOf("res_github001", "Code", integration("github"))
const drive = resourceOf("res_gdrive001", "Company files", integration("google-drive"))
const orders = resourceOf("res_orders001", "orders db", { kind: "database", engine: "postgres", connectionSecretId: notion.id, readOnly: false })
const org = [notion, atlassian, github, drive, orders]

const matched = (rule: string, scope: ReadonlyArray<typeof notion.id> = []) => {
  const result = matchTargets(rule, org, scope)
  return { targets: result.targets.map((t) => [t.resource.id, t.product, t.matched, t.mention]), unknown: result.unknown }
}

describe("matchTargets", () => {
  it("finds the founder's Notion server by product name, whatever the resource is called", () => {
    assert.deepStrictEqual(matched("nobody can update todo list in notion").targets, [["res_notion0001", "Notion", "alias", "notion"]])
  })

  it("resolves aliases: gh, jira, drive", () => {
    assert.deepStrictEqual(matched("contractors can't push to main on gh").targets, [["res_github001", "GitHub", "alias", "gh"]])
    assert.deepStrictEqual(matched("nobody closes jira tickets").targets, [["res_atlass001", "Atlassian", "alias", "jira"]])
    assert.deepStrictEqual(matched("never share files from Drive publicly").targets, [["res_gdrive001", "Google Drive", "alias", "drive"]])
  })

  it("matches a resource by its own name before its product", () => {
    assert.deepStrictEqual(matched("never run DROP on the orders db").targets, [["res_orders001", "orders db", "name", "orders db"]])
    assert.deepStrictEqual(matched("nobody edits the team wiki").targets, [["res_notion0001", "Notion", "name", "Team wiki"]])
  })

  it("names products the org has not added, and still finds the ones it has", () => {
    const result = matched("nobody posts in Slack or creates Linear issues from Notion")
    assert.deepStrictEqual(result.targets, [["res_notion0001", "Notion", "alias", "notion"]])
    assert.deepStrictEqual(result.unknown, [{ mention: "linear", product: "Linear" }, { mention: "slack", product: "Slack" }])
  })

  it("uses an explicit scope instead of the wording", () => {
    assert.deepStrictEqual(matched("nobody deletes anything", [github.id]).targets, [["res_github001", "GitHub", "scope", ""]])
  })

  it("does not read words inside other words", () => {
    assert.deepStrictEqual(matched("nobody downloads the board deck from the ghost site").targets, [])
  })
})
