import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { McpTool } from "../../mcp/sdk"
import { resourceOf } from "../../testing/gateway-fakes"
import notionTools from "./curated/notion.json"
import { rankTools } from "./rank"
import { describeTool, fromListing, signatureOf } from "./tool-doc"

const notion = resourceOf("res_notion0001", "Notion", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http" })
const docs = Schema.decodeUnknownSync(Schema.Struct({ tools: Schema.Array(McpTool) }))(notionTools).tools.map((tool) => fromListing(notion, tool))

describe("rankTools", () => {
  it("puts the tools that update pages first for an update rule, and keeps reads for near misses", () => {
    const ranked = rankTools("nobody can update todo list in notion", docs).map((doc) => doc.name)
    assert.strictEqual(ranked[0], "notion-update-page")
    assert.notInclude(ranked.slice(0, 5), "notion-get-users")
    assert.include(ranked, "notion-fetch")
    assert.include(ranked, "notion-query-data-sources")
  })

  it("puts deleting tools first for a delete rule", () => {
    assert.strictEqual(rankTools("never delete pages in Notion", docs)[0]?.name, "notion-delete-pages")
  })

  it("keeps to the limit and the character budget", () => {
    assert.strictEqual(rankTools("update notion", docs, { limit: 5 }).length, 5)
    const budget = 600
    const small = rankTools("update notion", docs, { budgetChars: budget })
    assert.isAtLeast(small.length, 1)
    assert.isAtMost(small.map(describeTool).join("\n").length, budget + describeTool(small[0]!).length)
  })
})

describe("signatureOf", () => {
  it("renders required arguments first, enums and nested shapes compactly", () => {
    const update = docs.find((doc) => doc.name === "notion-update-page")!
    const signature = signatureOf(update.inputSchema)
    assert.match(signature, /^page_id\*: string/)
    assert.include(signature, "command*: \"update_properties\"|\"update_content\"|\"replace_content\"|\"apply_template\"")
    assert.include(signature, "content_updates: {old_str, new_str, replace_all_matches}[]")
    assert.strictEqual(update.gatewayName, "notion__notion-update-page")
    assert.strictEqual(update.access, "destructive")
  })
})
