import { Schema, SchemaTransformation } from "effect"
import { AccountMode } from "../connections/account"
import { McpAuth } from "../connections/mcp-auth"
import { ResourceId } from "../ids"
import { IntegrationConfig, IntegrationConfigInput } from "../integrations/connection"
import { HttpUrl } from "../primitives"
import { SkillConfig } from "../skills/config"
import { EnvName, SecretDelivery } from "./delivery-mode"

export const ResourceKind = Schema.Literals(["mcp_server", "tool", "skill", "database", "api", "integration", "secret", "variable"])
export type ResourceKind = typeof ResourceKind.Type

export const McpTransport = Schema.Literals(["streamable_http", "sse"])
export type McpTransport = typeof McpTransport.Type

/** Absent means `shared`: the behaviour of every resource stored before account modes existed. */
const accountMode = { accountMode: Schema.optionalKey(AccountMode) }

const mcpServerFields = {
  kind: Schema.tag("mcp_server"),
  url: HttpUrl,
  transport: McpTransport,
  ...accountMode,
  /** Absent: no credential. Credentials are never inline: a shared static token is a `secret` resource. */
  auth: Schema.optionalKey(McpAuth)
}

/** A shared static token needs its secret; per-user tokens come from each member, so none may be named. */
const mcpCredentialRules = Schema.makeFilter((config: { readonly accountMode?: AccountMode; readonly auth?: McpAuth }) => {
  if (config.auth?.type !== "secret") return undefined
  const shared = (config.accountMode ?? "shared") === "shared"
  if (shared && config.auth.secretId === undefined) return { path: ["auth", "secretId"], issue: "a shared token needs its secret" }
  if (!shared && config.auth.secretId !== undefined) return { path: ["auth", "secretId"], issue: "per-user tokens are connected by each member" }
  return undefined
})

/**
 * An upstream MCP server. Rows stored before `auth` existed carry `authSecretId` (a bearer token secret); it
 * still decodes, as `auth: { type: "secret", secretId }`, and is still accepted as input.
 */
export const McpServerConfig = Schema.Struct({ ...mcpServerFields, authSecretId: Schema.optionalKey(ResourceId) }).pipe(
  Schema.decodeTo(
    Schema.toType(Schema.Struct(mcpServerFields)).check(mcpCredentialRules),
    SchemaTransformation.transform({
      decode: ({ authSecretId, ...config }) => {
        if (authSecretId === undefined || config.auth !== undefined) return config
        const auth: McpAuth = { type: "secret", secretId: authSecretId }
        return { ...config, auth }
      },
      encode: (config) => config
    })
  )
).annotate({ identifier: "McpServerConfig" })
export type McpServerConfig = typeof McpServerConfig.Type

/** A single tool of an MCP server, so it can be granted on its own. */
export const ToolConfig = Schema.Struct({
  kind: Schema.tag("tool"),
  serverId: ResourceId,
  toolName: Schema.NonEmptyString
}).annotate({ identifier: "ToolConfig" })

/**
 * Engines the gateway reaches with a connection string from the referenced secret: Postgres and MySQL over
 * TCP, ClickHouse over its HTTP(S) interface. D1 and SQLite are not reachable by connection string from a
 * Worker, so they are not offered.
 */
export const DatabaseEngine = Schema.Literals(["postgres", "mysql", "clickhouse"])
export type DatabaseEngine = typeof DatabaseEngine.Type

/** `readOnly` is enforced by the database itself (a read-only transaction or ClickHouse `readonly=1`), not only by parsing SQL. */
export const DatabaseConfig = Schema.Struct({
  kind: Schema.tag("database"),
  engine: DatabaseEngine,
  connectionSecretId: ResourceId,
  readOnly: Schema.Boolean
}).annotate({ identifier: "DatabaseConfig" })

export const ApiMethod = Schema.Literals(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"])
export type ApiMethod = typeof ApiMethod.Type

/** Without `allowedMethods`, an API resource is read-only. */
export const defaultApiMethods: readonly [ApiMethod, ...Array<ApiMethod>] = ["GET"]

/** Methods that only read; every other method needs a `write` grant. */
export const isSafeApiMethod = (method: ApiMethod): boolean => method === "GET" || method === "HEAD"

/** A path prefix under `baseUrl`, such as `/v1/customers`: no dot segments, query, fragment or backslashes. */
export const ApiPathPrefix = Schema.String.check(
  Schema.isMaxLength(512),
  Schema.isPattern(/^(?!.*\/\.{1,2}(?:\/|$))\/[^\s?#\\%]*$/)
).annotate({ identifier: "ApiPathPrefix" })

/**
 * Credentials come from `authSecretId`: sent as `Authorization: Bearer <secret>` by default, or verbatim in
 * the `authHeader` header when one is named (for `X-Api-Key` style APIs or a full `Basic ...` value).
 */
export const ApiConfig = Schema.Struct({
  kind: Schema.tag("api"),
  baseUrl: HttpUrl,
  ...accountMode,
  /** The shared credential. In `per_user` mode each member connects their own and this must be absent. */
  authSecretId: Schema.optionalKey(ResourceId),
  authHeader: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9-]{1,64}$/))),
  allowedMethods: Schema.optionalKey(Schema.NonEmptyArray(ApiMethod)),
  /** Absent: any path under `baseUrl`. */
  allowedPaths: Schema.optionalKey(Schema.NonEmptyArray(ApiPathPrefix))
}).check(Schema.makeFilter((config) =>
  config.accountMode === "per_user" && config.authSecretId !== undefined
    ? { path: ["authSecretId"], issue: "per-user credentials are connected by each member" }
    : undefined
)).annotate({ identifier: "ApiConfig" })

/**
 * Secret values live only in envelope-encrypted versions, never in the resource model. Rows stored before
 * delivery existed have neither field and decode as `gateway_only` under their derived env name (see
 * `deliverability` and `envNameOf`).
 */
export const SecretConfig = Schema.Struct({
  kind: Schema.tag("secret"),
  delivery: Schema.optionalKey(SecretDelivery),
  /** Delivered name; absent means the resource name upper-snake-cased. */
  envName: Schema.optionalKey(EnvName)
}).annotate({ identifier: "SecretConfig" })
export type SecretConfig = typeof SecretConfig.Type

/** Variables are not secret, so always deliverable to anyone with a `use` grant. */
export const VariableConfig = Schema.Struct({
  kind: Schema.tag("variable"),
  value: Schema.String.check(Schema.isMaxLength(10_000)),
  envName: Schema.optionalKey(EnvName)
}).annotate({ identifier: "VariableConfig" })

export const ResourceConfig = Schema.Union([
  McpServerConfig,
  ToolConfig,
  SkillConfig,
  DatabaseConfig,
  ApiConfig,
  IntegrationConfig,
  SecretConfig,
  VariableConfig
]).annotate({ identifier: "ResourceConfig" })
export type ResourceConfig = typeof ResourceConfig.Type

/**
 * Configs that can be edited in place; a secret changes only by rotation. Integrations take their input
 * form: OAuth2 status and tokens are Smartplane's to manage.
 */
export const EditableResourceConfig = Schema.Union([
  McpServerConfig,
  ToolConfig,
  SkillConfig,
  DatabaseConfig,
  ApiConfig,
  IntegrationConfigInput,
  VariableConfig
]).annotate({ identifier: "EditableResourceConfig" })
export type EditableResourceConfig = typeof EditableResourceConfig.Type
