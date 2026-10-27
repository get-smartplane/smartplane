import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest"
import { pieceLoaders } from "@pc/integrations/generated/pieces/business"
import { Effect, Layer } from "effect"
import { customAuth, oauthAuth, realPieces, request, run } from "../testing/harness"
import { mockProvider } from "../testing/mock-provider"
import { CatalogIndex } from "./catalog-index"
import { PieceLoader } from "./piece-loader"
import { PieceRunner } from "./runner"
import { ActionStore } from "./store"

/**
 * The business shard's real pieces (Microsoft 365, ERP, CRM) through the runner, against a local stand-in
 * for each provider: what reaches the provider is checked, including the host each connection selects.
 */
const hosts = ["graph.microsoft.us", "1234567.suitetalk.api.netsuite.com", "quickbooks.api.intuit.com", "acme.my.salesforce.com", "api.businesscentral.dynamics.com"]
const provider = mockProvider(hosts, ({ host }) =>
  host === "quickbooks.api.intuit.com" ? { QueryResponse: { Customer: [{ Id: "58", DisplayName: "Acme" }] } } : { id: "107", records: [], totalSize: 0, done: true })

beforeAll(provider.start)
afterAll(provider.stop)

const encode = (text: string) => encodeURIComponent(text).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)

/** Recomputes an OAuth 1.0a HMAC-SHA256 signature (RFC 5849 §3.4) from the request NetSuite would receive. */
const expectedSignature = async (method: string, url: URL, header: string, consumerSecret: string, tokenSecret: string) => {
  const oauth = Object.fromEntries(Array.from(header.matchAll(/(\w+)="([^"]*)"/g), ([, key = "", value = ""]) => [key, decodeURIComponent(value)]))
  const params = [...Object.entries(oauth).filter(([key]) => key.startsWith("oauth_") && key !== "oauth_signature"), ...url.searchParams.entries()]
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .sort()
    .join("&")
  const base = [method, encode(`${url.origin}${url.pathname}`), encode(params)].join("&")
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${encode(consumerSecret)}&${encode(tokenSecret)}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(base)))
  return { expected: btoa(String.fromCharCode(...signature)), actual: oauth.oauth_signature }
}

describe("business shard pieces through the runner", () => {
  it.effect("Microsoft Outlook sends mail through the cloud the connection names (US government: graph.microsoft.us)", () =>
    Effect.gen(function*() {
      const auth = oauthAuth("eyJ0eXAi.ms-access-token", { cloud: "login.microsoftonline.us", tenant: "contoso.onmicrosoft.com" })
      const result = yield* run(request("microsoft-outlook", "outlook_send_email", { recipients: ["ana@contoso.com"], subject: "Q3 close", bodyFormat: "text", body: "Numbers attached." }, auth))
      const last = provider.last()
      assert.deepStrictEqual([last?.method, last?.host, last?.path, last?.headers.authorization], ["POST", "graph.microsoft.us", "/v1.0/me/sendMail", "Bearer eyJ0eXAi.ms-access-token"])
      assert.deepInclude(JSON.parse(last?.body ?? "{}").message, { subject: "Q3 close", toRecipients: [{ emailAddress: { address: "ana@contoso.com" } }] })
      assert.deepInclude(result.output, { success: true, subject: "Q3 close" })
    }).pipe(Effect.provide(realPieces)))

  it.effect("NetSuite signs each request with OAuth 1.0a (HMAC-SHA256) and never sends the secrets", () =>
    Effect.gen(function*() {
      const secrets = { consumerSecret: "cs-0f9a8b7c6d5e", tokenSecret: "ts-1a2b3c4d5e6f" } // gitleaks:allow (fake test values)
      const auth = customAuth({ accountId: "1234567", consumerKey: "ck-123456", tokenId: "tk-123456", ...secrets })
      yield* run(request("netsuite", "getCustomer", { customerId: "107" }, auth))
      const last = provider.last()
      const header = String(last?.headers.authorization)
      assert.deepStrictEqual([last?.method, last?.host, last?.path], ["GET", "1234567.suitetalk.api.netsuite.com", "/services/rest/record/v1/customer/107"])
      assert.match(header, /^OAuth realm="1234567",.*oauth_consumer_key="ck-123456".*oauth_signature_method="HMAC-SHA256"/)
      const url = new URL(`https://${last?.host}${last?.path}`)
      const { expected, actual } = yield* Effect.promise(() => expectedSignature("GET", url, header, secrets.consumerSecret, secrets.tokenSecret))
      assert.strictEqual(actual, expected)
      assert.notInclude(JSON.stringify(last), secrets.consumerSecret)
      assert.notInclude(JSON.stringify(last), secrets.tokenSecret)
    }).pipe(Effect.provide(realPieces)))

  it.effect("QuickBooks queries the company (realm) named in the connection's props", () =>
    Effect.gen(function*() {
      const result = yield* run(request("quickbooks", "find_customer", { search_term: "Acme" }, oauthAuth("qb-access-token", { companyId: "9130" })))
      const last = provider.last()
      assert.deepStrictEqual([last?.host, last?.headers.authorization], ["quickbooks.api.intuit.com", "Bearer qb-access-token"])
      assert.match(last?.path ?? "", /^\/v3\/company\/9130\/query\?minorversion=\d+&query=SELECT/)
      assert.deepStrictEqual(result.output, { found: true, result: { Id: "58", DisplayName: "Acme" } })
    }).pipe(Effect.provide(realPieces)))

  it.effect("Salesforce runs SOQL on the instance from the token response", () =>
    Effect.gen(function*() {
      const auth = oauthAuth("sf-access-token", { environment: "login.salesforce.com" }, { instance_url: "https://acme.my.salesforce.com" })
      const result = yield* run(request("salesforce", "run_soql_query", { query: "SELECT Id FROM Account" }, auth))
      const last = provider.last()
      assert.deepStrictEqual([last?.host, last?.path, last?.headers.authorization], ["acme.my.salesforce.com", "/services/data/v56.0/query?q=SELECT+Id+FROM+Account", "Bearer sf-access-token"])
      assert.deepInclude(result.output, { count: 0, done: true })
    }).pipe(Effect.provide(realPieces)))

  it.effect("Business Central reads from the environment in the connection's props", () =>
    Effect.gen(function*() {
      yield* run(request("microsoft-dynamics-365-business-central", "get-record", { company_id: "c1", record_type: "customers", record_id: "r1" }, oauthAuth("bc-access-token", { cloud: "login.microsoftonline.com", environment: "Production" })))
      const last = provider.last()
      assert.deepStrictEqual([last?.host, last?.path], ["api.businesscentral.dynamics.com", "/v2.0/Production/api/v2.0/companies(c1)/customers(r1)"])
    }).pipe(Effect.provide(realPieces)))

  it.effect("a shard's Worker runs only its own pieces", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(run(request("microsoft-outlook", "outlook_get_my_profile", {}, oauthAuth("t"))))
      assert.strictEqual(error._tag, "UnknownAction")
    }).pipe(Effect.provide(PieceRunner.layer.pipe(Layer.provide(Layer.mergeAll(CatalogIndex.forShard("core"), PieceLoader.make(pieceLoaders), ActionStore.memory()))))))
})
