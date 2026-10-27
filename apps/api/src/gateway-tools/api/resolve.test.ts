import { assert, describe, it } from "@effect/vitest"
import { type Action, type ApiConfig, ResourceId } from "@pc/domain"
import { Effect } from "effect"
import type { RequestArgs } from "./request-args"
import { resolveRequest, usableMethods } from "./resolve"

const resourceId = ResourceId.make("res_crmapi001")
const config: typeof ApiConfig.Type = {
  kind: "api",
  baseUrl: "https://crm.example.com/api/v2/",
  allowedMethods: ["GET", "POST", "DELETE"],
  allowedPaths: ["/customers", "/invoices/"]
}

const resolve = (args: RequestArgs, action: Action = "write", cfg = config) => resolveRequest(resourceId, cfg, action, args)
const failureOf = (args: RequestArgs, action: Action = "write", cfg = config) =>
  resolve(args, action, cfg).pipe(Effect.flip, Effect.map((error) => error._tag === "PolicyDenied" ? error.reasons[0]._tag : error._tag))

describe("API request resolution", () => {
  it.effect("joins the path under the base URL and keeps query parameters", () =>
    Effect.gen(function*() {
      const request = yield* resolve({ method: "GET", path: "/customers/42", query: { expand: "orders", limit: 5 } }, "use")
      assert.strictEqual(request.url.toString(), "https://crm.example.com/api/v2/customers/42?expand=orders&limit=5")
    }))

  it.effect("only lets `use` grants send GET/HEAD; mutating methods need `write`", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* failureOf({ method: "POST", path: "/customers", body: { name: "Ada" } }, "use"), "ActionNotGranted")
      assert.strictEqual((yield* resolve({ method: "POST", path: "/customers", body: { name: "Ada" } }, "write")).method, "POST")
      assert.deepStrictEqual(usableMethods(config, "use"), ["GET"])
      assert.deepStrictEqual(usableMethods(config, "write"), ["GET", "POST", "DELETE"])
    }))

  it.effect("refuses methods the resource does not allow, defaulting to GET only", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* failureOf({ method: "PUT", path: "/customers/1" }), "ToolNotAllowed")
      const bare: typeof ApiConfig.Type = { kind: "api", baseUrl: "https://crm.example.com" }
      assert.strictEqual(yield* failureOf({ method: "DELETE", path: "/x" }, "admin", bare), "ToolNotAllowed")
      assert.deepStrictEqual(usableMethods(bare, "admin"), ["GET"])
    }))

  it.effect("enforces allowed path prefixes on segment boundaries", () =>
    Effect.gen(function*() {
      assert.strictEqual(yield* failureOf({ method: "GET", path: "/admin" }), "ToolNotAllowed")
      assert.strictEqual(yield* failureOf({ method: "GET", path: "/customers-export" }), "ToolNotAllowed")
      assert.strictEqual((yield* resolve({ method: "GET", path: "/invoices/7" })).url.pathname, "/api/v2/invoices/7")
      assert.strictEqual((yield* resolve({ method: "GET", path: "/customers" })).url.pathname, "/api/v2/customers")
    }))

  it.effect("rejects traversal, scheme/host overrides and smuggled query strings", () =>
    Effect.gen(function*() {
      const attempts = [
        "/customers/../admin",
        "/customers/%2e%2e/admin",
        "/customers/%2E%2e/%2e%2E/admin",
        "/customers/.%2e/admin",
        "/customers/..%2fadmin",
        "/customers%2f..%2fadmin",
        "/customers/%5c..%5cadmin",
        "/customers\\..\\admin",
        "//evil.example.com/customers",
        "https://evil.example.com/customers",
        "customers",
        "/customers?admin=true",
        "/customers#x",
        "/customers/%zz",
        "/customers/ a"
      ]
      for (const path of attempts) {
        assert.strictEqual(yield* failureOf({ method: "GET", path }), "InvalidInput", path)
      }
    }))

  it.effect("forwards only allow-listed headers and refuses bodies on reads", () =>
    Effect.gen(function*() {
      const request = yield* resolve({
        method: "GET",
        path: "/customers",
        headers: { Accept: "application/json", Authorization: "Bearer stolen", Host: "evil.example.com", Cookie: "a=b" }
      })
      assert.deepStrictEqual(request.headers, { accept: "application/json" })
      assert.strictEqual(yield* failureOf({ method: "GET", path: "/customers", body: {} }), "InvalidInput")
      assert.strictEqual(yield* failureOf({ method: "GET", path: "/customers", headers: { accept: "a\r\nX-Evil: 1" } }), "InvalidInput")
    }))
})
