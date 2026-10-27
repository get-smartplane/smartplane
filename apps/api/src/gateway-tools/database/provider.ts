import { type DatabaseConfig, InvalidInput, type Resource } from "@pc/domain"
import { Effect, Schema } from "effect"
import { allows, type EffectiveGrant } from "../../access/resolution"
import { describe, toolName } from "../../mcp/naming"
import type { CallerScope, GatewayTool, ToolProvider } from "../../mcp/provider"
import { schemaStatement } from "./introspection"
import { formatSqlResult } from "./results"
import { DatabaseRunner } from "./runner"

export const MaxRows = 1000
const MaxSchemaRows = 5000

const QueryArgs = Schema.Struct({
  sql: Schema.String.check(Schema.isBetweenLength(1, 100_000)),
  params: Schema.optionalKey(Schema.Array(Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null])).check(Schema.isMaxLength(100)))
})
const SchemaArgs = Schema.Struct({ table: Schema.optionalKey(Schema.NonEmptyString) })

const decode = <S extends Schema.Codec<unknown, unknown>>(schema: S, expected: string) => (args: unknown) =>
  Schema.decodeUnknownEffect(schema)(args).pipe(Effect.mapError((error) => new InvalidInput({ message: `expected ${expected}: ${error.message}` })))
const decodeQuery = decode(QueryArgs, "{ sql: string, params?: Array<string | number | boolean | null> }")
const decodeSchema = decode(SchemaArgs, "{ table?: string }")

/**
 * A statement runs read-only unless the resource allows writes *and* the caller holds `write`. Read-only
 * is enforced by the database (a read-only transaction), so guards see SQL text but are not the only line.
 */
export const readOnlyFor = (config: typeof DatabaseConfig.Type, grant: EffectiveGrant): boolean =>
  config.readOnly || !allows(grant, "write")

const queryInput = {
  type: "object",
  properties: {
    sql: { type: "string", description: "One SQL statement. Use placeholders for values: $1 for Postgres, ? for MySQL, {p1:Type} for ClickHouse (params[0] is p1, e.g. {p1:String})." },
    params: { type: "array", items: { type: ["string", "number", "boolean", "null"] } }
  },
  required: ["sql"],
  additionalProperties: false
}
const schemaInput = { type: "object", properties: { table: { type: "string", description: "Only this table." } }, additionalProperties: false }

/** `<db-slug>__query` and `<db-slug>__schema` for every `database` resource the caller holds `use` on. */
export const makeDatabaseProvider = Effect.gen(function*() {
  const runner = yield* DatabaseRunner

  const toolsFor = ({ actor }: CallerScope, grant: EffectiveGrant): ReadonlyArray<GatewayTool> => {
    const resource: Resource = grant.resource
    const config = resource.config
    if (config.kind !== "database") return []
    const readOnly = readOnlyFor(config, grant)
    const mode = readOnly ? "read-only" : "read-write"
    return [
      {
        definition: { name: toolName(resource, "query"), description: describe(resource, `Run one ${mode} SQL statement on the ${config.engine} database (at most ${MaxRows} rows).`, resource.description), inputSchema: queryInput },
        target: resource,
        operation: "query",
        prepare: (args) =>
          Effect.map(decodeQuery(args), ({ sql, params = [] }) => ({
            arguments: { sql, params, readOnly },
            execute: Effect.map(runner.run(resource, config, actor, { sql, params }, { readOnly, maxRows: MaxRows }), formatSqlResult)
          }))
      },
      {
        definition: { name: toolName(resource, "schema"), description: describe(resource, `List tables and columns of the ${config.engine} database.`), inputSchema: schemaInput },
        target: resource,
        operation: "schema",
        prepare: (args) =>
          Effect.map(decodeSchema(args), ({ table }) => ({
            arguments: { table: table ?? null },
            execute: Effect.map(
              runner.run(resource, config, actor, schemaStatement(config.engine, table ?? null), { readOnly: true, maxRows: MaxSchemaRows }),
              formatSqlResult
            )
          }))
      }
    ]
  }

  const provider: ToolProvider = {
    source: "database",
    tools: (scope) =>
      Effect.succeed(
        Array.from(scope.access.values())
          .filter((grant) => grant.resource.config.kind === "database" && allows(grant, "use"))
          .flatMap((grant) => toolsFor(scope, grant))
      )
  }
  return provider
})
