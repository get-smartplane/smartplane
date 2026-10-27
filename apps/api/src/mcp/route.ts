import { type Principal, Unauthorized } from "@pc/domain"
import { Effect, Layer, Option, Redacted } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { TokenAuthenticator, TokenPrefix } from "../access/token-auth"
import { OAuthAuthenticator } from "../oauth/authenticator"
import { oauthSettings } from "../oauth/settings"
import { AppConfig } from "../platform/config"
import { McpGateway } from "./gateway"
import { ProjectHeader, scopeToProject } from "./project-scope"
import { serveMcp } from "./sdk"
import { decodeToolsMode, ToolsHeader, type ToolsMode } from "./search/mode"
import { SkillGateway } from "./skills/skill-gateway"

const bearer = HttpServerRequest.HttpServerRequest.useSync((request) => {
  const match = /^bearer\s+(.+)$/i.exec(request.headers.authorization ?? "")
  return match?.[1] === undefined ? undefined : Redacted.make(match[1].trim())
})

/**
 * RFC 6750 challenge. With MCP OAuth on, `resource_metadata` (RFC 9728) sends MCP clients to our protected
 * resource metadata, from which they discover AuthKit and start the authorization flow.
 */
const unauthorized = (error: Unauthorized) =>
  AppConfig.useSync((config) => {
    const settings = oauthSettings(config)
    const challenge = [
      `realm="${config.API_URL}/mcp"`,
      ...(settings ? [`resource_metadata="${settings.metadataUrl}"`] : []),
      ...(error.reason === "missing_credentials" ? [] : [`error="invalid_token"`, `error_description="${error.reason}"`])
    ]
    return HttpServerResponse.jsonUnsafe({ error: error._tag, reason: error.reason }, {
      status: 401,
      headers: { "www-authenticate": `Bearer ${challenge.join(", ")}` }
    })
  })

/** `pc_` access tokens and AuthKit OAuth access tokens work side by side; both resolve to the same Principal. */
export const authenticate = (token: Redacted.Redacted<string>): Effect.Effect<Principal, Unauthorized, TokenAuthenticator | OAuthAuthenticator> =>
  Redacted.value(token).startsWith(TokenPrefix)
    ? TokenAuthenticator.use((tokens) => tokens.authenticate(token))
    : OAuthAuthenticator.use((oauth) => oauth.authenticate(token))

/** Bridges the SDK's promise-based handlers back into Effect, keeping the request's tracing context. */
const handle = (principal: Principal, mode: ToolsMode | undefined) =>
  Effect.gen(function*() {
    const gateway = yield* McpGateway
    const skills = yield* SkillGateway
    const run = Effect.runPromiseWith(yield* Effect.context<never>())
    const request = yield* Effect.orDie(HttpServerRequest.HttpServerRequest.use(HttpServerRequest.toWeb))
    const response = yield* Effect.promise(async () => {
      const streamed = await serveMcp(request, {
        listTools: () => run(gateway.listTools(principal, mode)),
        callTool: (name, args) => run(gateway.callTool(principal, name, args)),
        listPrompts: () => run(skills.listPrompts(principal)),
        getPrompt: (name, args) => run(Effect.result(skills.getPrompt(principal, name, args))),
        listResources: () => run(skills.listResources(principal)),
        readResource: (uri) => run(Effect.result(skills.readResource(principal, uri)))
      })
      // A stateless POST's SSE stream ends right after the JSON-RPC reply. Buffering it keeps the tool call
      // inside this request's span and Worker invocation, so its spans are exported rather than cut off.
      if (request.method !== "POST" || streamed.body === null) return streamed
      return new Response(await streamed.arrayBuffer(), { status: streamed.status, headers: streamed.headers })
    })
    return HttpServerResponse.fromWeb(response)
  })

/** The MCP endpoint agents connect to. Only bearer tokens are accepted here, never session cookies. */
const mcp = Effect.gen(function*() {
  const token = yield* bearer
  if (token === undefined) return yield* unauthorized(new Unauthorized({ reason: "missing_credentials" }))
  const authenticated = yield* Effect.result(authenticate(token))
  if (authenticated._tag === "Failure") return yield* unauthorized(authenticated.failure)
  const header = yield* HttpServerRequest.HttpServerRequest.useSync((request) => request.headers[ProjectHeader])
  const scoped = scopeToProject(authenticated.success, header)
  if (scoped._tag === "Failure") {
    const status = scoped.failure._tag === "Forbidden" ? 403 : 400
    return HttpServerResponse.jsonUnsafe({ error: scoped.failure._tag, message: scoped.failure.message }, { status })
  }
  const principal = scoped.success
  const requested = yield* HttpServerRequest.HttpServerRequest.useSync((request) => request.headers[ToolsHeader])
  const mode = requested === undefined ? Option.some(undefined) : decodeToolsMode(requested.trim().toLowerCase())
  if (Option.isNone(mode)) {
    return HttpServerResponse.jsonUnsafe({ error: "InvalidInput", message: `${ToolsHeader} must be "all" or "search"` }, { status: 400 })
  }
  yield* Effect.annotateCurrentSpan({ "org.id": principal.orgId, "principal.kind": principal._tag, "principal.project": principal.projectId ?? "", "mcp.tools_mode": mode.value ?? "" })
  return yield* handle(principal, mode.value)
}).pipe(Effect.withSpan("mcp.request"))

export const McpRoutes = Layer.mergeAll(HttpRouter.add("POST", "/mcp", mcp), HttpRouter.add("GET", "/mcp", mcp), HttpRouter.add("DELETE", "/mcp", mcp))
