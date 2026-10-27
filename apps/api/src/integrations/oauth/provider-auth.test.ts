import { assert, describe, it } from "@effect/vitest"
import { type IntegrationConfigInput, PieceId, type Resource, ResourceId } from "@pc/domain"
import { Effect } from "effect"
import { now, orgId, userId } from "../../testing/fixtures"
import { IntegrationCatalog } from "../catalog"
import { checkIntegrationConfig } from "../config-check"
import { oauthAppOf } from "./app"
import { authorizeUrl } from "./authorize-url"
import { fillScopes, fillTemplate } from "./templates"

const clientSecretId = ResourceId.make("res_appsecret1")

/** An OAuth2 integration of `pieceId` whose connection carries `props`. */
const integration = (pieceId: string, props?: Readonly<Record<string, string>>): Resource => ({
  id: ResourceId.make("res_integrat01"),
  orgId,
  projectId: null,
  name: pieceId,
  description: "",
  config: {
    kind: "integration",
    pieceId: PieceId.make(pieceId),
    connection: { type: "oauth2", clientId: "app-1", clientSecretId, status: "not_connected", ...(props === undefined ? {} : { props }) }
  },
  createdBy: userId,
  createdAt: now,
  updatedAt: null
})

const appOf = (pieceId: string, props?: Readonly<Record<string, string>>) => oauthAppOf(integration(pieceId, props))

const authorizeParams = (pieceId: string, props?: Readonly<Record<string, string>>) =>
  Effect.map(appOf(pieceId, props), (app) => {
    const url = new URL(authorizeUrl({ ...app, redirectUri: "https://app.example.com/cb", state: "s", codeChallenge: "c" }))
    return { origin: url.origin, path: url.pathname, scope: url.searchParams.get("scope"), prompt: url.searchParams.get("prompt"), props: app.props, tokenUrl: app.tokenUrl }
  })

describe("OAuth2 endpoints of Microsoft 365, ERP and CRM pieces", () => {
  it.effect("Microsoft: the piece's cloud and tenant defaults, or the connection's own; no consent prompt", () =>
    Effect.gen(function*() {
      const outlook = yield* authorizeParams("microsoft-outlook")
      assert.deepStrictEqual([outlook.origin, outlook.path, outlook.prompt], ["https://login.microsoftonline.com", "/common/oauth2/v2.0/authorize", null])
      assert.strictEqual(outlook.scope, "Mail.ReadWrite Mail.Send Calendars.Read offline_access User.Read openid email profile")
      const tenant = "2f7c3e1a-9b4d-4c8e-a1f0-6d5e4c3b2a10"
      const teams = yield* authorizeParams("microsoft-teams", { cloud: "login.microsoftonline.us", tenantId: tenant })
      assert.deepStrictEqual([teams.origin, teams.path, teams.tokenUrl], ["https://login.microsoftonline.us", `/${tenant}/oauth2/v2.0/authorize`, `https://login.microsoftonline.us/${tenant}/oauth2/v2.0/token`])
      assert.deepInclude(teams.props, { cloud: "login.microsoftonline.us", tenantId: tenant })
    }).pipe(Effect.provide(IntegrationCatalog.layer)))

  it.effect("Microsoft: a cloud outside the piece's options is refused; a tenant cannot leave the sign-in host", () =>
    Effect.gen(function*() {
      const refused = yield* Effect.flip(appOf("microsoft-outlook", { cloud: "login.example.com" }))
      assert.include(refused.message, "\"cloud\" must be one of login.microsoftonline.com, login.microsoftonline.us")
      const escaped = yield* authorizeParams("microsoft-teams", { tenantId: "evil.example/x?y=" })
      assert.deepStrictEqual([escaped.origin, escaped.path], ["https://login.microsoftonline.com", "/evil.example%2Fx%3Fy%3D/oauth2/v2.0/authorize"])
    }).pipe(Effect.provide(IntegrationCatalog.layer)))

  it.effect("Dynamics 365: the org URL fills the scope; Business Central gets offline access and its environment", () =>
    Effect.gen(function*() {
      const missing = yield* Effect.flip(appOf("microsoft-dynamics-crm"))
      assert.include(missing.message, "\"hostUrl\"")
      const crm = yield* authorizeParams("microsoft-dynamics-crm", { hostUrl: "https://acme.crm4.dynamics.com", tenantId: "acme.onmicrosoft.com" })
      assert.strictEqual(crm.scope, "https://acme.crm4.dynamics.com/.default openid email profile offline_access")
      assert.strictEqual(crm.path, "/acme.onmicrosoft.com/oauth2/v2.0/authorize")
      const central = yield* authorizeParams("microsoft-dynamics-365-business-central")
      assert.isTrue(central.scope?.split(" ").includes("offline_access"))
      assert.deepInclude(central.props, { environment: "Production", cloud: "login.microsoftonline.com" })
    }).pipe(Effect.provide(IntegrationCatalog.layer)))

  it.effect("Salesforce (PKCE) signs in at its environment; Zoho at its data centre; QuickBooks needs the realm", () =>
    Effect.gen(function*() {
      const production = yield* authorizeParams("salesforce")
      const sandbox = yield* authorizeParams("salesforce", { environment: "test.salesforce.com" })
      assert.deepStrictEqual([production.origin, sandbox.origin, sandbox.tokenUrl], ["https://login.salesforce.com", "https://test.salesforce.com", "https://test.salesforce.com/services/oauth2/token"])
      const zoho = yield* authorizeParams("zoho-crm", { location: "zoho.eu" })
      assert.strictEqual(zoho.origin, "https://accounts.zoho.eu")
      const failures = yield* Effect.forEach([
        { type: "oauth2", clientId: "z", clientSecretId, props: { location: "zoho.example" } },
        { type: "oauth2", clientId: "z", clientSecretId }
      ] as const, (connection) => Effect.flip(checkIntegrationConfig({ kind: "integration", pieceId: PieceId.make("zoho-crm"), connection })))
      assert.deepStrictEqual(failures.map((failure) => failure.field), ["config.connection.props", "config.connection.props"])
      const quickbooks = (props?: Readonly<Record<string, string>>): IntegrationConfigInput => ({
        kind: "integration",
        pieceId: PieceId.make("quickbooks"),
        connection: { type: "oauth2", clientId: "q", clientSecretId, ...(props === undefined ? {} : { props }) }
      })
      assert.include((yield* Effect.flip(checkIntegrationConfig(quickbooks()))).message, "\"companyId\"")
      yield* checkIntegrationConfig(quickbooks({ companyId: "9130" }))
    }).pipe(Effect.provide(IntegrationCatalog.layer)))
})

describe("OAuth2 templates", () => {
  it("encodes URL values and splits scope values, reporting the first missing field", () => {
    assert.deepStrictEqual(fillTemplate("https://{cloud}/{{tenant}}/x", { cloud: "a.example", tenant: "b c" }), { url: "https://a.example/b%20c/x" })
    assert.deepStrictEqual(fillScopes(["{mode}", "openid", "{host}/.default"], { mode: "a b openid", host: "https://h" }), { scopes: ["a", "b", "openid", "https://h/.default"] })
    assert.deepStrictEqual(fillScopes(["{mode}", "{host}"], { host: "" }), { missing: "mode" })
  })
})
