import { assert, describe, it } from "@effect/vitest"
import { type IntegrationConfigInput, type OAuth2PieceAuth, PieceId, ResourceId } from "@pc/domain"
import { Effect } from "effect"
import { checkGrantConditions } from "../access/grant-conditions"
import { resourceOf } from "../testing/gateway-fakes"
import { IntegrationCatalog } from "./catalog"
import { checkIntegrationConfig } from "./config-check"
import { authorizeUrl } from "./oauth/authorize-url"
import { fillTemplate } from "./oauth/templates"

const secretId = ResourceId.make("res_secret0001")
const config = (pieceId: string, connection: IntegrationConfigInput["connection"], actions?: readonly [string, ...Array<string>]): IntegrationConfigInput => ({
  kind: "integration",
  pieceId: PieceId.make(pieceId),
  connection,
  ...(actions ? { actions } : {})
})

describe("integration configs", () => {
  it.effect("accept bundled pieces with a connection method the piece offers", () =>
    Effect.gen(function*() {
      yield* checkIntegrationConfig(config("github", { type: "secret_text", secretId }, ["get_issue_ai"]))
      yield* checkIntegrationConfig(config("http", { type: "none" }))
      const failures = yield* Effect.forEach([
        config("myspace", { type: "none" }),
        config("linear", { type: "oauth2", clientId: "x", clientSecretId: secretId }),
        config("github", { type: "secret_text", secretId }, ["github_create_issue"]),
        config("github", { type: "secret_text", secretId }, ["no_such_action"])
      ], (input) => Effect.flip(checkIntegrationConfig(input)))
      assert.deepStrictEqual(failures.map((failure) => failure.field), ["config.pieceId", "config.connection", "config.actions", "config.actions"])
    }).pipe(Effect.provide(IntegrationCatalog.layer)))
})

describe("grant conditions", () => {
  const server = resourceOf("res_server0001", "AP", { kind: "mcp_server", url: "https://ap.example.com", transport: "sse" })
  const api = resourceOf("res_api0000001", "CRM", { kind: "api", baseUrl: "https://crm.example.com" })
  const integration = resourceOf("res_github0001", "GitHub", { kind: "integration", pieceId: PieceId.make("github"), connection: { type: "secret_text", secretId } })

  it.effect("allow tool lists and argument constraints only where they can apply", () =>
    Effect.gen(function*() {
      yield* checkGrantConditions(integration, { tools: ["get_issue_ai"], arguments: { get_issue_ai: { owner: ["acme"] } } })
      yield* checkGrantConditions(server, { arguments: { ap_run_action: { pieceName: ["slack"] } } })
      const failures = yield* Effect.forEach([
        checkGrantConditions(api, { tools: ["x"] }),
        checkGrantConditions(api, { arguments: { x: { a: ["b"] } } }),
        checkGrantConditions(server, { tools: ["ap_list"], arguments: { ap_run_action: { pieceName: ["slack"] } } })
      ], Effect.flip)
      assert.deepStrictEqual(failures.map((failure) => failure.field), ["conditions.tools", "conditions.arguments", "conditions.arguments"])
    }))
})

describe("authorize URLs", () => {
  const auth: OAuth2PieceAuth = {
    type: "oauth2",
    displayName: "Zendesk",
    authUrl: "https://{subdomain}.zendesk.com/oauth/authorizations/new",
    tokenUrl: "https://{subdomain}.zendesk.com/oauth/tokens",
    scopes: ["read", "write"],
    pkce: "S256",
    clientAuthentication: "body",
    extraParams: { owner: "user" },
    prompt: "omit",
    fields: []
  }

  it("fills connection fields into templated endpoints and reports a missing one", () => {
    assert.deepStrictEqual(fillTemplate(auth.authUrl, { subdomain: "acme" }), { url: "https://acme.zendesk.com/oauth/authorizations/new" })
    assert.deepStrictEqual(fillTemplate(auth.tokenUrl, {}), { missing: "subdomain" })
  })

  it("adds PKCE, scopes, offline access and the piece's extra parameters", () => {
    const url = new URL(authorizeUrl({
      auth,
      connection: { type: "oauth2", clientId: "zd", clientSecretId: secretId },
      authUrl: "https://acme.zendesk.com/oauth/authorizations/new",
      scopes: auth.scopes,
      redirectUri: "https://api.example.com/api/integrations/oauth/callback",
      state: "s1",
      codeChallenge: "c1"
    }))
    assert.deepStrictEqual(Object.fromEntries(url.searchParams), {
      response_type: "code",
      client_id: "zd",
      redirect_uri: "https://api.example.com/api/integrations/oauth/callback",
      state: "s1",
      scope: "read write",
      access_type: "offline",
      code_challenge: "c1",
      code_challenge_method: "S256",
      owner: "user"
    })
  })
})
