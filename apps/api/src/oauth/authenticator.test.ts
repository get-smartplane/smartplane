import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import type { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose"
import { Principals } from "../auth/principals"
import { UsersRepo } from "../auth/users-repo"
import { MembersRepo } from "../org/members-repo"
import { OrgsRepo } from "../org/orgs-repo"
import { RolesRepo } from "../org/roles-repo"
import { TeamsRepo } from "../org/teams-repo"
import { AppConfig, type EnvConfig } from "../platform/config"
import { TestDatabase } from "../testing/database"
import { now, orgId } from "../testing/fixtures"
import { memoryKv } from "../testing/gateway-fakes"
import { seedOrg, selectRows } from "../testing/seed"
import { OAuthAuthenticator } from "./authenticator"
import { AuthKitKeys } from "./jwks"
import { protectedResourceMetadata } from "./routes"
import { oauthSettings } from "./settings"
import { AccessTokenVerifier } from "./verifier"

const issuer = "https://acme.authkit.app"
const resource = "https://api.example.com/mcp"

const config: EnvConfig = {
  APP_URL: "https://app.example.com",
  API_URL: "https://api.example.com",
  ENVIRONMENT: "test",
  CLASSIFIER_MODEL: "@cf/test/clef",
  COMPILER_MODEL: "@cf/test/llm",
  WORKOS_API_KEY: Redacted.make("sk_test"),
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: Redacted.make("x".repeat(32)),
  WORKOS_WEBHOOK_SECRET: Redacted.make("whsec"),
  SECRETS_KEK: Redacted.make("a2V5"),
  SECRETS_KEK_ID: "test-1",
  WORKOS_AUTHKIT_DOMAIN: "acme.authkit.app"
}

/** AuthKit's signing key and an attacker's, generated per run; only the first is published in the JWKS. */
const keys = Effect.promise(async () => {
  const authkit = await generateKeyPair("RS256", { extractable: true })
  const attacker = await generateKeyPair("RS256", { extractable: true })
  const jwk = { ...(await exportJWK(authkit.publicKey)), kid: "authkit-1", alg: "RS256", use: "sig" }
  return { authkit, attacker, jwks: { keys: [jwk] } }
})

const sign = (privateKey: CryptoKey, claims: JWTPayload, overrides: { iss?: string; aud?: string; expiresAt?: number; kid?: string } = {}) =>
  Effect.promise(() =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: overrides.kid ?? "authkit-1" })
      .setIssuer(overrides.iss ?? issuer)
      .setAudience(overrides.aud ?? resource)
      .setIssuedAt(Math.floor(now.epochMilliseconds / 1000))
      .setExpirationTime(overrides.expiresAt ?? Math.floor(now.epochMilliseconds / 1000) + 300)
      .sign(privateKey)
  )

const authKitServing = (jwks: unknown, fetches: Array<string>) =>
  Layer.succeed(HttpClient.HttpClient, HttpClient.make((request, url) =>
    Effect.sync(() => {
      fetches.push(url.toString())
      return HttpClientResponse.fromWeb(request, Response.json(jwks))
    })))

const layerFor = (jwks: unknown, fetches: Array<string>) =>
  OAuthAuthenticator.layer.pipe(
    Layer.provide(AccessTokenVerifier.layer.pipe(Layer.provide(AuthKitKeys.layer.pipe(Layer.provide([memoryKv(), authKitServing(jwks, fetches)]))))),
    Layer.provide(Principals.layer),
    Layer.provideMerge(Layer.mergeAll(UsersRepo.layer, OrgsRepo.layer, MembersRepo.layer, RolesRepo.layer, TeamsRepo.layer)),
    Layer.provideMerge(Layer.mergeAll(TestDatabase, Layer.succeed(AppConfig, config)))
  )

/** The seeded member: WorkOS user `wos_usr_testuser01` in WorkOS org `org_workos`. */
const member = { sub: "wos_usr_testuser01", org_id: "org_workos" }

const run = <A, E>(test: (env: Effect.Success<typeof keys>) => Effect.Effect<A, E, OAuthAuthenticator | SqlClient.SqlClient>, fetches: Array<string> = []) =>
  Effect.gen(function*() {
    const env = yield* keys
    yield* TestClock.setTime(now.epochMilliseconds)
    return yield* Effect.gen(function*() {
      yield* seedOrg
      return yield* test(env)
    }).pipe(Effect.provide(layerFor(env.jwks, fetches)))
  })

const authenticate = (token: string) => OAuthAuthenticator.use((oauth) => oauth.authenticate(Redacted.make(token)))
const reasonOf = (token: string) => authenticate(token).pipe(Effect.flip, Effect.map((error) => error.reason))

describe("MCP OAuth with AuthKit access tokens", () => {
  it.effect("maps a valid token to the member principal of the token's org, caching the JWKS", () => {
    const fetches: Array<string> = []
    return run(({ authkit }) =>
      Effect.gen(function*() {
        const token = yield* sign(authkit.privateKey, member)
        const principal = yield* authenticate(token)
        assert.strictEqual(principal._tag, "User")
        assert.strictEqual(principal.orgId, orgId)
        assert.deepStrictEqual(principal.teamIds.map(String), ["team_testteam1"])
        assert.isNull(principal.tokenId)
        yield* authenticate(token)
        assert.deepStrictEqual(fetches, [`${issuer}/oauth2/jwks`])
      }), fetches)
  })

  it.effect("falls back to the user's only active membership when the token names no org", () =>
    run(({ authkit }) =>
      Effect.gen(function*() {
        const principal = yield* authenticate(yield* sign(authkit.privateKey, { sub: member.sub }))
        assert.strictEqual(principal.orgId, orgId)
      })))

  it.effect("rejects expired tokens", () =>
    run(({ authkit }) =>
      Effect.gen(function*() {
        const expired = yield* sign(authkit.privateKey, member, { expiresAt: Math.floor(now.epochMilliseconds / 1000) - 120 })
        assert.strictEqual(yield* reasonOf(expired), "expired")
      })))

  it.effect("rejects a wrong audience, a wrong issuer and a key AuthKit never published", () =>
    run(({ authkit, attacker }) =>
      Effect.gen(function*() {
        assert.strictEqual(yield* reasonOf(yield* sign(authkit.privateKey, member, { aud: "https://other.example.com/mcp" })), "invalid_credentials")
        assert.strictEqual(yield* reasonOf(yield* sign(authkit.privateKey, member, { iss: "https://evil.authkit.app" })), "invalid_credentials")
        assert.strictEqual(yield* reasonOf(yield* sign(attacker.privateKey, member)), "invalid_credentials")
        assert.strictEqual(yield* reasonOf(yield* sign(attacker.privateKey, member, { kid: "attacker-1" })), "invalid_credentials")
        assert.strictEqual(yield* reasonOf("not-a-jwt"), "invalid_credentials")
      })))

  it.effect("rejects tokens of members who are no longer active", () =>
    run(({ authkit }) =>
      Effect.gen(function*() {
        yield* selectRows("UPDATE memberships SET status = 'deprovisioned' WHERE id = ?", "mem_testmem01")
        assert.strictEqual(yield* reasonOf(yield* sign(authkit.privateKey, member)), "deprovisioned")
      })))

  it.effect("rejects tokens for orgs and users we do not know", () =>
    run(({ authkit }) =>
      Effect.gen(function*() {
        assert.strictEqual(yield* reasonOf(yield* sign(authkit.privateKey, { ...member, org_id: "org_unknown" })), "no_organization")
        assert.strictEqual(yield* reasonOf(yield* sign(authkit.privateKey, { ...member, sub: "wos_stranger" })), "invalid_credentials")
      })))
})

describe("protected resource metadata", () => {
  it("points MCP clients at AuthKit for the /mcp resource", () => {
    const settings = oauthSettings(config)
    assert.deepStrictEqual(settings && { ...protectedResourceMetadata(settings), metadataUrl: settings.metadataUrl }, {
      resource,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      resource_name: "Smartplane",
      metadataUrl: "https://api.example.com/.well-known/oauth-protected-resource/mcp"
    })
    assert.isUndefined(oauthSettings({ ...config, WORKOS_AUTHKIT_DOMAIN: "" }))
  })
})
