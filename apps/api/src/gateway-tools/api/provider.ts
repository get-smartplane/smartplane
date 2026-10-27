import { InvalidInput } from "@pc/domain"
import { ConnectionResolver } from "../../connections/resolver"
import { Effect, Schema } from "effect"
import { allows, type EffectiveGrant } from "../../access/resolution"
import { describe, toolName } from "../../mcp/naming"
import type { CallerScope, GatewayTool, ToolProvider } from "../../mcp/provider"
import { ApiCaller } from "./caller"
import { RequestArgs, requestInputSchema } from "./request-args"
import { resolveRequest, usableMethods } from "./resolve"

const decodeArgs = (args: unknown) =>
  Schema.decodeUnknownEffect(RequestArgs)(args).pipe(
    Effect.mapError((error) => new InvalidInput({ message: `expected { method, path, query?, headers?, body? }: ${error.message}` }))
  )

/** `<api-slug>__request` for every `api` resource the caller holds `use` on. */
export const makeApiProvider = Effect.gen(function*() {
  const caller = yield* ApiCaller
  const resolver = yield* ConnectionResolver

  const requestTool = ({ principal, actor }: CallerScope, { resource, action }: EffectiveGrant): ReadonlyArray<GatewayTool> => {
    const config = resource.config
    if (config.kind !== "api") return []
    const methods = usableMethods(config, action)
    if (methods.length === 0) return []
    return [{
      definition: {
        name: toolName(resource, "request"),
        description: describe(resource, `Send an HTTP request to the ${resource.name} API (methods: ${methods.join(", ")}).`, resource.description),
        inputSchema: requestInputSchema(methods, config.allowedPaths)
      },
      target: resource,
      operation: "request",
      prepare: (args) =>
        Effect.gen(function*() {
          const request = yield* resolveRequest(resource.id, config, action, yield* decodeArgs(args))
          // After the method and path passed the grant: which account (shared or the caller's own) it would use.
          const connection = yield* resolver.context(resource, principal)
          return {
            connection,
            // Audit data must be JSON: a GET has no body key at all rather than an undefined one.
            arguments: {
              method: request.method,
              path: request.url.pathname,
              query: request.url.search,
              headers: request.headers,
              ...(request.body === undefined ? {} : { body: request.body })
            },
            execute: caller.send(resource, config, { principal, actor }, request)
          }
        })
    }]
  }

  const provider: ToolProvider = {
    source: "api",
    tools: (scope) =>
      Effect.succeed(
        Array.from(scope.access.values())
          .filter((grant) => grant.resource.config.kind === "api" && allows(grant, "use"))
          .flatMap((grant) => requestTool(scope, grant))
      )
  }
  return provider
})
