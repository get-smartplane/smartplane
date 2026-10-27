import { assert, describe, it } from "@effect/vitest"
import { resourceOf } from "../testing/gateway-fakes"
import { argumentHints, classifierState, redactCredentials } from "./classifier-state"

const notion = resourceOf("res_notion0001", "Team wiki", { kind: "mcp_server", url: "https://mcp.notion.com/mcp", transport: "streamable_http", accountMode: "per_user" })

describe("classifierState", () => {
  const state = classifierState({
    actor: { type: "User", email: "dana@acme.com", role: "member" },
    resource: notion,
    tool: "notion-update-page",
    toolInfo: { gatewayName: "team-wiki__notion-update-page", title: "Update page", description: "[Team wiki] Update a Notion page's properties, content, icon, or cover." },
    arguments: {
      page_id: "https://www.notion.so/acme/Todo-list-8c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f",
      command: "update_properties",
      properties: { Done: "__YES__" },
      api_key: "secret-value-123",
      headers: { Authorization: "Bearer sk_live_abc" },
      note: "x".repeat(2000)
    },
    connection: null
  })

  it("includes the product, the tool's title and description, and the arguments", () => {
    assert.deepInclude(state.resource, { name: "Team wiki", product: "Notion", accountMode: "per_user" })
    assert.strictEqual(state.tool, "notion-update-page")
    assert.strictEqual(state.gatewayTool, "team-wiki__notion-update-page")
    assert.strictEqual(state.toolTitle, "Update page")
    assert.include(state.toolDescription, "Update a Notion page's properties")
    assert.deepInclude(state.arguments, { command: "update_properties", properties: { Done: "__YES__" } })
  })

  it("reads the page title from a Notion URL in the arguments, without fetching anything", () => {
    assert.deepStrictEqual(state.argumentHints, ["Notion page titled \"Todo list\""])
  })

  it("never carries credentials and stays within budget", () => {
    const text = JSON.stringify(state)
    assert.notInclude(text, "secret-value-123")
    assert.notInclude(text, "sk_live_abc")
    assert.include(text, "…(+1600 chars)")
    assert.isBelow(text.length, 2500)
  })
})

describe("redactCredentials", () => {
  it("redacts credential keys and token-shaped values anywhere, and leaves the rest", () => {
    assert.deepStrictEqual(redactCredentials({ password: "hunter2", list: ["ghp_abcdefghijklmnopqrstuvwxyz0123", "plain"], max_tokens: 10, page_size: 5 }), {
      password: "[redacted]",
      list: ["[redacted]", "plain"],
      max_tokens: 10,
      page_size: 5
    })
  })
})

describe("argumentHints", () => {
  it("reads Linear issue keys and titles from URLs", () => {
    assert.deepStrictEqual(argumentHints({ url: "https://linear.app/acme/issue/ENG-142/checkout-button-misaligned" }), ["Linear issue ENG-142 \"checkout button misaligned\""])
  })
})
