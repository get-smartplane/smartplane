import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { GrantConditions } from "../access/grant"
import { ResourceId } from "../ids"
import { EditableResourceConfig, ResourceConfig } from "../resources/config"
import { requiredGrantAction } from "./action"
import { IntegrationCallbackFailure } from "./callback"
import { type IntegrationConfig, type IntegrationConfigInput, storedIntegrationConfig } from "./connection"
import { PieceId } from "./names"

const decodeConfig = Schema.decodeUnknownSync(ResourceConfig)
const decodeInput = Schema.decodeUnknownSync(EditableResourceConfig)
const secretId = ResourceId.make("res_secret0001")
const appSecret = ResourceId.make("res_appsecret1")
const tokenSecret = ResourceId.make("res_tokensec01")

describe("integration resources", () => {
  it("references credentials by secret id and never accepts them inline", () => {
    const config = decodeConfig({ kind: "integration", pieceId: "github", connection: { type: "secret_text", secretId } })
    expect(config).toEqual({ kind: "integration", pieceId: "github", connection: { type: "secret_text", secretId } })
    expect(() => decodeConfig({ kind: "integration", pieceId: "github", connection: { type: "secret_text", value: "ghp_x" } })).toThrow()
    expect(() => decodeConfig({ kind: "integration", pieceId: "GitHub!", connection: { type: "none" } })).toThrow()
    expect(() => decodeConfig({ kind: "integration", pieceId: "github", connection: { type: "none" }, actions: [] })).toThrow()
  })

  it("takes no OAuth2 status or token from admin input", () => {
    const input = decodeInput({
      kind: "integration",
      pieceId: "slack",
      connection: { type: "oauth2", clientId: "123.456", clientSecretId: appSecret, status: "connected", tokenSecretId: tokenSecret }
    })
    expect(input).toEqual({ kind: "integration", pieceId: "slack", connection: { type: "oauth2", clientId: "123.456", clientSecretId: appSecret } })
  })

  it("keeps the OAuth2 token only while the OAuth app is unchanged", () => {
    const current: IntegrationConfig = {
      kind: "integration",
      pieceId: PieceId.make("slack"),
      connection: { type: "oauth2", clientId: "a", clientSecretId: appSecret, status: "connected", tokenSecretId: tokenSecret }
    }
    const input = (clientId: string, actions?: readonly [string, ...Array<string>]): IntegrationConfigInput => ({
      kind: "integration",
      pieceId: PieceId.make("slack"),
      connection: { type: "oauth2", clientId, clientSecretId: appSecret },
      ...(actions ? { actions } : {})
    })
    expect(storedIntegrationConfig(input("a", ["slack_post_message"]), current)).toEqual({
      ...current,
      actions: ["slack_post_message"]
    })
    expect(storedIntegrationConfig(input("b"), current).connection).toEqual({ type: "oauth2", clientId: "b", clientSecretId: appSecret, status: "not_connected" })
    expect(storedIntegrationConfig(input("a")).connection).toMatchObject({ status: "not_connected" })
  })

  it("needs `use` to read or search and `write` for everything else, unclassified included", () => {
    expect([requiredGrantAction("read"), requiredGrantAction("search")]).toEqual(["use", "use"])
    expect([requiredGrantAction("write"), requiredGrantAction("destructive"), requiredGrantAction(null)]).toEqual(["write", "write", "write"])
  })
})

describe("OAuth callback failure reasons", () => {
  it("names every reason the callback redirects with, and nothing else", () => {
    const decode = Schema.decodeUnknownSync(IntegrationCallbackFailure)
    expect(IntegrationCallbackFailure.literals).toEqual(["expired_state", "denied", "session_mismatch", "integration_changed", "exchange_failed"])
    for (const reason of IntegrationCallbackFailure.literals) expect(decode(reason)).toBe(reason)
    expect(() => decode("connected")).toThrow()
    expect(() => decode("<script>")).toThrow()
  })
})

describe("grant argument constraints", () => {
  const decode = Schema.decodeUnknownSync(GrantConditions)

  it("maps tool names to allowed values per argument path", () => {
    const conditions = decode({ tools: ["ap_run_action"], arguments: { ap_run_action: { pieceName: ["github"], "input.owner": ["acme", 7, true] } } })
    expect(conditions.arguments?.ap_run_action?.["input.owner"]).toEqual(["acme", 7, true])
  })

  it("rejects empty value lists, object values and malformed paths", () => {
    expect(() => decode({ arguments: { t: { pieceName: [] } } })).toThrow()
    expect(() => decode({ arguments: { t: { pieceName: [{ a: 1 }] } } })).toThrow()
    expect(() => decode({ arguments: { t: { "a..b": ["x"] } } })).toThrow()
    expect(() => decode({ arguments: { t: { "$.a": ["x"] } } })).toThrow()
  })
})
