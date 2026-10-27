import {
  type Action,
  actionImplies,
  type ApiConfig,
  type ApiMethod,
  defaultApiMethods,
  InvalidInput,
  isSafeApiMethod,
  PolicyDenied,
  type ResourceId
} from "@pc/domain"
import { Effect } from "effect"
import { forwardableHeaders, type RequestArgs } from "./request-args"

/** A request that stays under the resource's base URL, with agent headers filtered. Credentials come later. */
export interface ResolvedRequest {
  readonly method: ApiMethod
  readonly url: URL
  readonly headers: Readonly<Record<string, string>>
  readonly body: unknown
}

type ApiResourceConfig = typeof ApiConfig.Type

const invalid = (message: string) => Effect.fail(new InvalidInput({ message, field: "path" }))

/** Methods the resource allows that this grant can use: `use` permits GET/HEAD, mutating methods need `write`. */
export const usableMethods = (config: ApiResourceConfig, action: Action): ReadonlyArray<ApiMethod> =>
  (config.allowedMethods ?? defaultApiMethods).filter((method) => isSafeApiMethod(method) || actionImplies(action, "write"))

/**
 * A path must be absolute, without a scheme, host, query, fragment, backslash or dot segment, also once
 * percent-decoded: the URL parser would otherwise resolve `/v1/%2e%2e/admin` out of the base path.
 */
const checkPath = (path: string): Effect.Effect<void, InvalidInput> => {
  if (!path.startsWith("/") || path.startsWith("//")) return invalid("path must start with a single \"/\" and be relative to the API base")
  if (/[\s\u0000-\u001f\u007f\\?#]/.test(path)) return invalid("path must not contain whitespace, control characters, \"\\\", \"?\" or \"#\"; use `query` for parameters")
  for (const segment of path.split("/").slice(1)) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      return invalid("path contains malformed percent-encoding")
    }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      return invalid("path must not contain dot segments or encoded separators")
    }
  }
  return Effect.void
}

const underPrefix = (path: string, prefix: string) =>
  path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)

/** Joins the base and the path, then re-checks the result: same origin, still under the base path. */
const join = (baseUrl: string, path: string): Effect.Effect<URL, InvalidInput> => {
  const base = new URL(baseUrl)
  const basePath = base.pathname.replace(/\/+$/, "")
  const url = new URL(base.origin)
  url.pathname = `${basePath}${path}`
  base.searchParams.forEach((value, key) => url.searchParams.append(key, value))
  const inside = url.origin === base.origin && (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`))
  return inside ? Effect.succeed(url) : Effect.fail(new InvalidInput({ message: "path escapes the API base", field: "path" }))
}

const filterHeaders = (headers: Readonly<Record<string, string>> | undefined): Effect.Effect<Record<string, string>, InvalidInput> => {
  const kept: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (/[\r\n]/.test(value)) return Effect.fail(new InvalidInput({ message: `header ${name} contains a line break`, field: "headers" }))
    if (forwardableHeaders.has(name.toLowerCase())) kept[name.toLowerCase()] = value
  }
  return Effect.succeed(kept)
}

/** Checks a request against the resource's method/path allow-lists and the caller's grant, and builds its URL. */
export const resolveRequest = Effect.fn("ApiTool.resolveRequest")(function*(
  resourceId: ResourceId,
  config: ApiResourceConfig,
  action: Action,
  args: RequestArgs
) {
  const operation = `${args.method} ${args.path}`
  if (!(config.allowedMethods ?? defaultApiMethods).includes(args.method)) {
    return yield* new PolicyDenied({ reasons: [{ _tag: "ToolNotAllowed", resourceId, tool: operation }] })
  }
  if (!isSafeApiMethod(args.method) && !actionImplies(action, "write")) {
    return yield* new PolicyDenied({ reasons: [{ _tag: "ActionNotGranted", resourceId, required: "write" }] })
  }
  if (isSafeApiMethod(args.method) && args.body !== undefined) {
    return yield* new InvalidInput({ message: `${args.method} requests cannot carry a body`, field: "body" })
  }
  yield* checkPath(args.path)
  if (config.allowedPaths !== undefined && !config.allowedPaths.some((prefix) => underPrefix(args.path, prefix))) {
    return yield* new PolicyDenied({ reasons: [{ _tag: "ToolNotAllowed", resourceId, tool: operation }] })
  }
  const url = yield* join(config.baseUrl, args.path)
  for (const [key, value] of Object.entries(args.query ?? {})) url.searchParams.append(key, String(value))
  const resolved: ResolvedRequest = { method: args.method, url, headers: yield* filterHeaders(args.headers), body: args.body }
  return resolved
})
