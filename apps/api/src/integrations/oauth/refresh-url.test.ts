import { assert, describe, it } from "@effect/vitest"
import { PieceId, type Resource, ResourceId } from "@pc/domain"
import { Effect, Layer, Redacted, Schema } from "effect"
import { ResourcesRepo } from "../../resources/resources-repo"
import { fakeSecrets, recordingAudit } from "../../testing/gateway-fakes"
import { now, orgId, userId } from "../../testing/fixtures"
import { IntegrationCatalog } from "../catalog"
import { oauthAppOf } from "./app"
import { TokenEndpoint } from "./token-endpoint"
import { OAuthTokenSetJson } from "./token-set"
import { OAuthTokens } from "./tokens"

const clientSecretId = ResourceId.make("res_figmaapp01")
const tokenSecretId = ResourceId.make("res_figmatok01")
const integration = (pieceId: string): Resource => ({
  id: ResourceId.make("res_figma00001"),
  orgId,
  projectId: null,
  name: pieceId,
  description: "",
  config: { kind: "integration", pieceId: PieceId.make(pieceId), connection: { type: "oauth2", clientId: "fig-app", clientSecretId, status: "connected", tokenSecretId } },
  createdBy: userId,
  createdAt: now,
  updatedAt: null
})

const expiring = Schema.encodeSync(OAuthTokenSetJson)({ accessToken: "figd-old", refreshToken: "figr-1", tokenType: "bearer", scope: "", expiresAt: 0, data: {} })

describe("provider refresh endpoints", () => {
  it.effect("Figma refreshes at /v1/oauth/refresh; other pieces at their token URL", () => {
    const urls: Array<string> = []
    const endpoint = Layer.succeed(TokenEndpoint, { request: (url) => Effect.sync(() => (urls.push(url), { access_token: "figd-new", expires_in: 7_776_000 })) })
    const repo = Layer.succeed(ResourcesRepo, { list: () => Effect.die("unused"), find: () => Effect.die("unused"), findMany: () => Effect.die("unused"), ofKind: () => Effect.die("unused"), insert: () => Effect.die("unused"), update: () => Effect.void, remove: () => Effect.die("unused"), switchAccountMode: () => Effect.die("unused") })
    return Effect.gen(function*() {
      const figma = yield* oauthAppOf(integration("figma"))
      assert.deepStrictEqual([figma.tokenUrl, figma.refreshUrl], ["https://api.figma.com/v1/oauth/token", "https://api.figma.com/v1/oauth/refresh"])
      const slack = yield* oauthAppOf(integration("slack"))
      assert.strictEqual(slack.refreshUrl, slack.tokenUrl)
      const fresh = yield* OAuthTokens.use((tokens) => tokens.current(figma, { type: "system", id: "test" }))
      assert.strictEqual(Redacted.make(fresh.accessToken).pipe(Redacted.value), "figd-new")
      assert.deepStrictEqual(urls, ["https://api.figma.com/v1/oauth/refresh"])
    }).pipe(Effect.provide(Layer.mergeAll(
      IntegrationCatalog.layer,
      OAuthTokens.layer.pipe(Layer.provide([fakeSecrets({ [clientSecretId]: "fig-secret", [tokenSecretId]: expiring }), endpoint, repo, recordingAudit([])]))
    )))
  })
})
