import type { AuditEvent } from "@pc/domain"
import { Effect, Layer } from "effect"
import { McpCatalog } from "../mcp-catalog/mcp-catalog"
import type { McpTool } from "../mcp/sdk"
import { Upstream } from "../mcp/upstream"
import { UpstreamClient } from "../mcp/upstream-client"
import { ResourceToolList } from "../resources/resource-tools"
import { Resources } from "../resources/resources"
import { connectionServices } from "./connection-harness"
import { fakeOAuthServer, type FakeOAuthOptions, issuer } from "./fake-oauth-server"

/**
 * The fake authorization server behind a real catalog URL: the catalog server's protected-resource metadata
 * names `issuer`, which answers as `fakeOAuthServer` does. Nothing reaches the network.
 */
export const fakeCatalogServer = (serverUrl: string, options: FakeOAuthOptions = {}) => {
  const fake = fakeOAuthServer(options)
  const origin = new URL(serverUrl).origin
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(new Request(input, init).url)
    if (url.origin === origin && url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      fake.seen.push({ method: "GET", url: url.href, authorization: null, form: {}, body: "" })
      return Response.json({ resource: serverUrl, authorization_servers: [options.issuer ?? issuer], scopes_supported: ["read", "write"] })
    }
    if (url.origin === origin) return new Response("not found", { status: 404 })
    return fake.fetch(input, init)
  }
  return { fetch, seen: fake.seen }
}

/** Upstream tools as a server would list them, recording the credential each listing sent; calls are a test bug. */
export const fakeUpstreamTools = (tools: ReadonlyArray<McpTool>, listed: Array<string> = []) =>
  Layer.succeed(UpstreamClient, {
    listTools: (target) => Effect.sync(() => (listed.push(target.headers.authorization ?? ""), tools)),
    callTool: () => Effect.die("no tool calls in this test")
  })

/** The catalog and tool-list services over `connectionServices`, with `upstream` standing in for MCP servers. */
export const catalogServices = (fetch: typeof globalThis.fetch, events: Array<AuditEvent>, upstream: Layer.Layer<UpstreamClient>) =>
  Layer.mergeAll(McpCatalog.layer, ResourceToolList.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(Resources.layer, Upstream.layer.pipe(Layer.provide(upstream)))),
    Layer.provideMerge(connectionServices(fetch, events))
  )
