import { ApiMethod, ApiPathPrefix, HttpUrl } from "@pc/domain"
import { Effect, Option, Schema } from "effect"
import { Command, Flag } from "effect/cli"
import { api } from "../../../api/client"
import { field } from "../../../app/common-flags"
import { CommaList } from "../../../app/flag-values"
import { resolveResource } from "../../../resolve/entities"
import { commonFlags, createResource, optionalSecret, secretRef } from "./common"

const url = (name: string, description: string) => Flag.String(name).pipe(Flag.withSchema(HttpUrl), Flag.withDescription(description))

export const addMcpServer = Command.make("mcp-server", {
  ...commonFlags,
  url: url("url", "The upstream MCP server URL"),
  transport: Flag.ChoiceWithValue("transport", [["http", "streamable_http"], ["sse", "sse"]] as const).pipe(Flag.withDefault("streamable_http")),
  authSecret: secretRef("auth-secret", "Bearer credential for the upstream").pipe(Flag.optional)
}, (input) =>
  Effect.gen(function*() {
    const client = yield* api
    const authSecretId = yield* optionalSecret(client, input.authSecret)
    const auth = Option.match(authSecretId, { onNone: () => ({}), onSome: (secretId) => ({ auth: { type: "secret" as const, secretId } }) })
    yield* createResource(client, input, { kind: "mcp_server", url: input.url, transport: input.transport, ...auth })
  })).pipe(Command.withDescription("Add an upstream MCP server"))

export const addTool = Command.make("tool", {
  ...commonFlags,
  server: Flag.String("server").pipe(Flag.withDescription("The MCP server resource (name or id)")),
  toolName: Flag.String("tool-name").pipe(Flag.withSchema(Schema.NonEmptyString), Flag.withDescription("Tool name on that server"))
}, (input) =>
  Effect.gen(function*() {
    const client = yield* api
    const serverId = yield* resolveResource(client)(input.server)
    yield* createResource(client, input, { kind: "tool", serverId, toolName: input.toolName })
  })).pipe(Command.withDescription("Add one tool of an MCP server, so it can be granted on its own"))

export const addApi = Command.make("api", {
  ...commonFlags,
  baseUrl: url("base-url", "API base URL"),
  authSecret: secretRef("auth-secret", "Credential sent as Authorization: Bearer").pipe(Flag.optional),
  authHeader: Flag.String("auth-header").pipe(Flag.withDescription("Send the credential verbatim in this header instead"), Flag.optional),
  methods: Flag.String("methods").pipe(Flag.withSchema(CommaList(ApiMethod)), Flag.withDescription("Allowed methods, e.g. GET,POST (default GET)"), Flag.optional),
  paths: Flag.String("paths").pipe(Flag.withSchema(CommaList(ApiPathPrefix)), Flag.withDescription("Allowed path prefixes, e.g. /v1/customers"), Flag.optional)
}, (input) =>
  Effect.gen(function*() {
    const client = yield* api
    const authSecretId = yield* optionalSecret(client, input.authSecret)
    yield* createResource(client, input, {
      kind: "api",
      baseUrl: input.baseUrl,
      ...field("authSecretId", authSecretId),
      ...field("authHeader", input.authHeader),
      ...field("allowedMethods", input.methods),
      ...field("allowedPaths", input.paths)
    })
  })).pipe(Command.withDescription("Add an HTTP API agents may call through the gateway"))
