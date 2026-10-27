import { ApiMethod } from "@pc/domain"
import { Schema } from "effect"

const QueryValue = Schema.Union([Schema.String, Schema.Number, Schema.Boolean])

/** What an agent sends to `<api>__request`. The body is any JSON value and is sent as `application/json`. */
export const RequestArgs = Schema.Struct({
  method: ApiMethod,
  path: Schema.String.check(Schema.isBetweenLength(1, 2048)),
  query: Schema.optionalKey(Schema.Record(Schema.String, QueryValue)),
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String.check(Schema.isMaxLength(1024)))),
  body: Schema.optionalKey(Schema.Unknown)
})
export type RequestArgs = typeof RequestArgs.Type

/**
 * Request headers an agent may set. Everything else is dropped: credentials, hosts, cookies and hop-by-hop
 * headers are the gateway's business, and the resource's auth header is always injected last.
 */
export const forwardableHeaders: ReadonlySet<string> = new Set([
  "accept",
  "accept-language",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "idempotency-key",
  "x-request-id"
])

/** JSON Schema shown to the agent; `methods` are the ones this caller may actually use. */
export const requestInputSchema = (methods: ReadonlyArray<ApiMethod>, prefixes: ReadonlyArray<string> | undefined) => ({
  type: "object",
  properties: {
    method: { type: "string", enum: methods },
    path: {
      type: "string",
      description: `Path relative to the API base, starting with "/".${prefixes ? ` Allowed prefixes: ${prefixes.join(", ")}.` : ""}`
    },
    query: { type: "object", additionalProperties: { type: ["string", "number", "boolean"] }, description: "Query parameters." },
    headers: { type: "object", additionalProperties: { type: "string" }, description: `Optional headers: ${[...forwardableHeaders].join(", ")}.` },
    body: { description: "JSON request body (not allowed for GET/HEAD)." }
  },
  required: ["method", "path"],
  additionalProperties: false
})
