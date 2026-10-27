import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Result } from "effect"
import { FetchHttpClient } from "effect/http"
import { TokenEndpoint } from "../../integrations/oauth/token-endpoint"
import { AppConfig } from "../../platform/config"
import { testConfig } from "../../testing/config"
import type { AuthServerMetadata } from "./discovery"
import { sameIssuer, screenOAuthEndpoint } from "./endpoint-screen"
import { checkAuthServerMetadata } from "./metadata-check"

const metadata: AuthServerMetadata = {
  issuer: "https://auth.example.com",
  authorization_endpoint: "https://auth.example.com/authorize",
  token_endpoint: "https://auth.example.com/token",
  registration_endpoint: "https://auth.example.com/register",
  userinfo_endpoint: "https://auth.example.com/userinfo"
}

describe("OAuth endpoint screen", () => {
  it("accepts public HTTPS endpoints and refuses everything an SSRF or a downgrade needs", () => {
    assert.isTrue(Result.isSuccess(screenOAuthEndpoint("https://auth.example.com/token", "production")))
    for (const url of ["http://auth.example.com/token", "https://127.0.0.1/token", "https://10.1.2.3/t", "https://[::1]/t", "https://metadata.google.internal/t",
      "https://auth.example.com:8443/t", "https://user:pw@auth.example.com/t", "ftp://auth.example.com/t", "not a url"]) {
      assert.isTrue(Result.isFailure(screenOAuthEndpoint(url, "production")), url)
    }
  })

  it("allows http only for loopback hosts, and only in development", () => {
    assert.isTrue(Result.isSuccess(screenOAuthEndpoint("http://localhost:9000/token", "development")))
    assert.isTrue(Result.isSuccess(screenOAuthEndpoint("http://127.0.0.1:9000/token", "development")))
    assert.isTrue(Result.isFailure(screenOAuthEndpoint("http://localhost:9000/token", "production")))
    assert.isTrue(Result.isFailure(screenOAuthEndpoint("http://auth.example.com/token", "development")))
  })

  it("compares issuers exactly, tolerating one trailing slash", () => {
    assert.isTrue(sameIssuer("https://auth.example.com", "https://auth.example.com/"))
    assert.isFalse(sameIssuer("https://auth.example.com", "https://auth.example.com.evil.net"))
    assert.isFalse(sameIssuer("https://auth.example.com/tenant-a", "https://auth.example.com/tenant-b"))
  })

  it("checks issuer and endpoints itself, independent of the SDK", () => {
    assert.deepStrictEqual(checkAuthServerMetadata(metadata, "https://auth.example.com/", "production"), Result.succeed({ userinfoUrl: "https://auth.example.com/userinfo" }))
    assert.isTrue(Result.isFailure(checkAuthServerMetadata(metadata, "https://other.example.com", "production")))
    assert.isTrue(Result.isFailure(checkAuthServerMetadata({ ...metadata, token_endpoint: "http://auth.example.com/token" }, metadata.issuer, "production")))
    // A userinfo endpoint elsewhere is dropped rather than sent the access token.
    const offHost = checkAuthServerMetadata({ ...metadata, userinfo_endpoint: "https://tracker.example.net/userinfo" }, metadata.issuer, "production")
    assert.deepStrictEqual(offHost, Result.succeed({ userinfoUrl: undefined }))
  })
})

describe("TokenEndpoint", () => {
  const endpoint = (environment: string, calls: Array<string>) =>
    TokenEndpoint.layer.pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, async (input) => {
        calls.push(new Request(input).url)
        return new Response(JSON.stringify({ access_token: "at" }), { headers: { "content-type": "application/json" } })
      })),
      Layer.provide(Layer.succeed(AppConfig, { ...testConfig, ENVIRONMENT: environment }))
    )
  const client = { clientId: "c", clientSecret: Redacted.make("s3cret"), authentication: "body" as const }

  it.effect("refuses a non-HTTPS token URL without sending anything", () => {
    const calls: Array<string> = []
    return Effect.gen(function*() {
      const failure = yield* Effect.flip(TokenEndpoint.use((tokens) => tokens.request("http://auth.example.com/token", client, { grant_type: "authorization_code" })))
      assert.deepInclude(failure, { _tag: "TokenRequestFailed", error: "insecure_token_endpoint" })
      assert.deepStrictEqual(calls, [])
      yield* TokenEndpoint.use((tokens) => tokens.request("https://auth.example.com/token", client, { grant_type: "authorization_code" }))
      assert.deepStrictEqual(calls, ["https://auth.example.com/token"])
    }).pipe(Effect.provide(endpoint("production", calls)))
  })

  it.effect("allows a loopback token URL in development", () => {
    const calls: Array<string> = []
    return Effect.gen(function*() {
      yield* TokenEndpoint.use((tokens) => tokens.request("http://localhost:9000/token", client, { grant_type: "authorization_code" }))
      assert.deepStrictEqual(calls, ["http://localhost:9000/token"])
    }).pipe(Effect.provide(endpoint("development", calls)))
  })
})
