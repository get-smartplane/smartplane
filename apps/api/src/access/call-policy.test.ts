import { assert, describe, it } from "@effect/vitest"
import { ResourceId } from "@pc/domain"
import { resourceOf } from "../testing/gateway-fakes"
import { argumentMismatch, type GrantTerms, termsDenials } from "./call-policy"
import { type EffectiveAccess, toolDenials } from "./resolution"

const resourceId = ResourceId.make("res_activepcs1")

describe("argument constraints", () => {
  it("matches exact values at dot paths, every element of arrays, and fails closed on anything missing", () => {
    const rules = { pieceName: ["github", "slack"], "input.owner": ["acme"] }
    assert.isNull(argumentMismatch(rules, { pieceName: "github", input: { owner: "acme", repo: "x" } }))
    assert.strictEqual(argumentMismatch(rules, { pieceName: "gitlab", input: { owner: "acme" } }), "pieceName")
    assert.strictEqual(argumentMismatch(rules, { pieceName: "github" }), "input.owner")
    assert.strictEqual(argumentMismatch(rules, { pieceName: "github", input: { owner: ["acme", "evil"] } }), "input.owner")
    assert.isNull(argumentMismatch({ labels: ["bug", "p1"] }, { labels: ["bug"] }))
    assert.strictEqual(argumentMismatch({ labels: ["bug"] }, { labels: [] }), "labels")
    assert.strictEqual(argumentMismatch({ n: [7] }, { n: "7" }), "n")
    assert.isNull(argumentMismatch(undefined, {}))
  })

  it("needs one grant to cover action, tool and arguments together, without mixing grants", () => {
    const terms: ReadonlyArray<GrantTerms> = [
      { action: "use", conditions: { tools: ["ap_run_action"], arguments: { ap_run_action: { pieceName: ["github"] } } } },
      { action: "write", conditions: { tools: ["ap_list_pieces"] } }
    ]
    assert.deepStrictEqual(termsDenials(terms, resourceId, "ap_run_action", "use", { pieceName: "github" }), [])
    assert.deepStrictEqual(termsDenials(terms, resourceId, "ap_run_action", "use", { pieceName: "stripe" }), [
      { _tag: "ArgumentNotAllowed", resourceId, tool: "ap_run_action", path: "pieceName" }
    ])
    // The `write` grant does not list the tool, so it cannot lift the first grant's argument constraint.
    assert.deepStrictEqual(termsDenials(terms, resourceId, "ap_run_action", "write")[0]?._tag, "ToolNotAllowed")
    // Listing tools checks the tool and action only; arguments are checked per call.
    assert.deepStrictEqual(termsDenials(terms, resourceId, "ap_run_action", "use"), [])
    const unconstrained = [...terms, { action: "use" as const, conditions: {} }]
    assert.deepStrictEqual(termsDenials(unconstrained, resourceId, "ap_run_action", "use", { pieceName: "stripe" }), [])
  })

  it("applies constraints to upstream MCP tools, including grants on a single tool resource", () => {
    const server = resourceOf("res_activepcs1", "Activepieces", { kind: "mcp_server", url: "https://ap.example.com/mcp", transport: "streamable_http" })
    const single = resourceOf("res_aprunactn1", "Run action", { kind: "tool", serverId: server.id, toolName: "ap_run_action" })
    const access: EffectiveAccess = new Map([
      [single.id, { resource: single, action: "use", terms: [{ action: "use", conditions: { arguments: { ap_run_action: { pieceName: ["slack"] } } } }] }]
    ])
    assert.deepStrictEqual(toolDenials(access, server.id, "ap_run_action", { pieceName: "slack", actionName: "send" }), [])
    assert.deepStrictEqual(toolDenials(access, server.id, "ap_run_action", { pieceName: "github" }), [
      { _tag: "ArgumentNotAllowed", resourceId: server.id, tool: "ap_run_action", path: "pieceName" }
    ])
  })
})
