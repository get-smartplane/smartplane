import { assert, describe, it } from "@effect/vitest"
import { type Action, ResourceId } from "@pc/domain"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { actorOf } from "../../audit/actor"
import { noConnections } from "../../testing/connection-fakes"
import { userPrincipal } from "../../testing/fixtures"
import { accessOf, fakeSecrets, grantOf, resourceOf } from "../../testing/gateway-fakes"
import { ApiCaller, MaxResponseBytes } from "./caller"
import { makeApiProvider } from "./provider"

const secretId = ResourceId.make("res_crmsecret")
const crm = resourceOf("res_crmapi001", "CRM", {
  kind: "api",
  baseUrl: "https://crm.example.com/v2",
  authSecretId: secretId,
  allowedMethods: ["GET", "POST"]
})

interface Sent {
  readonly method: string
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
}

/** An upstream that records requests and answers with `respond`. */
const upstream = (sent: Array<Sent>, respond: () => Response) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        sent.push({ method: request.method, url: url.toString(), headers: request.headers })
        return HttpClientResponse.fromWeb(request, respond())
      })
    )
  )

const toolFor = (action: Action, sent: Array<Sent>, respond: () => Response) =>
  Effect.gen(function*() {
    const provider = yield* makeApiProvider
    const principal = userPrincipal()
    const [tool] = yield* provider.tools({ principal, actor: actorOf(principal), access: accessOf(grantOf(crm, action)) })
    return tool ?? (yield* Effect.die("expected one tool"))
  }).pipe(Effect.provide(Layer.merge(ApiCaller.layer.pipe(Layer.provide([fakeSecrets({ [secretId]: "sk_live_crm" }), upstream(sent, respond), noConnections])), noConnections)))

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...init.headers } })

describe("API gateway tools", () => {
  it.effect("exposes <slug>__request with the methods the grant can use", () =>
    Effect.gen(function*() {
      const tool = yield* toolFor("use", [], () => json({}))
      assert.strictEqual(tool.definition.name, "crm__request")
      assert.include(tool.definition.description ?? "", "methods: GET)")
      assert.notInclude(tool.definition.description ?? "", "POST")
    }))

  it.effect("injects the credential server-side and returns the JSON response", () =>
    Effect.gen(function*() {
      const sent: Array<Sent> = []
      const tool = yield* toolFor("write", sent, () => json({ id: 7 }, { status: 201, headers: { "set-cookie": "s=1" } }))
      const prepared = yield* tool.prepare({ method: "POST", path: "/customers", body: { name: "Ada" }, headers: { authorization: "Bearer agent" } })
      assert.notInclude(JSON.stringify(prepared.arguments), "sk_live_crm")
      const result = yield* prepared.execute
      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0]?.method, "POST")
      assert.strictEqual(sent[0]?.url, "https://crm.example.com/v2/customers")
      // The agent's own Authorization header is dropped; the resource's credential is injected instead.
      assert.strictEqual(sent[0]?.headers.authorization, "Bearer sk_live_crm")
      const text = result.content[0]?.text
      assert.deepStrictEqual(typeof text === "string" ? JSON.parse(text) : null, {
        status: 201,
        headers: { "content-type": "application/json" },
        body: { id: 7 }
      })
      assert.isFalse(result.isError)
    }))

  it.effect("returns redirects instead of following them, and caps large bodies", () =>
    Effect.gen(function*() {
      const redirecting = yield* toolFor("use", [], () => new Response(null, { status: 302, headers: { location: "https://evil.example.com/" } }))
      const get = yield* redirecting.prepare({ method: "GET", path: "/x" })
      // Prepared arguments land in audit events, which only carry JSON: no undefined members.
      assert.deepStrictEqual(JSON.parse(JSON.stringify(get.arguments)), get.arguments)
      const moved = yield* get.execute
      assert.include(String(moved.content[0]?.text), "\"location\": \"https://evil.example.com/\"")

      const large = yield* toolFor("use", [], () => new Response("x".repeat(MaxResponseBytes + 10), { headers: { "content-type": "text/plain" } }))
      const cut = yield* Effect.flatMap(large.prepare({ method: "GET", path: "/x" }), (call) => call.execute)
      assert.include(String(cut.content[0]?.text), `body cut at ${MaxResponseBytes} bytes`)
    }))
})
