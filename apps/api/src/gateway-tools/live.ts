import { Effect, Layer } from "effect"
import { ToolProviders } from "../mcp/provider"
import { ApiCaller } from "./api/caller"
import { makeApiProvider } from "./api/provider"
import { makeBuiltinProvider } from "./builtin"
import { makeIntegrationProvider } from "./integration/provider"
import { clickhouseDriver } from "./database/clickhouse/driver"
import { SqlDrivers } from "./database/driver"
import { mysqlDriver } from "./database/mysql"
import { postgresDriver } from "./database/postgres"
import { makeDatabaseProvider } from "./database/provider"
import { DatabaseRunner } from "./database/runner"
import { makeUpstreamMcpProvider } from "./upstream-mcp"

/**
 * Direct TCP per call. In production, a Hyperdrive config per database would add pooling and caching,
 * but Hyperdrive bindings are static in wrangler.jsonc, so it cannot serve resources created at runtime.
 */
const SqlDriversLive = Layer.succeed(SqlDrivers, { postgres: postgresDriver, mysql: mysqlDriver, clickhouse: clickhouseDriver })

/** Every tool source the gateway serves, in precedence order. Add a provider here to add a tool source. */
export const ToolProvidersLive = Layer.effect(
  ToolProviders,
  Effect.all([makeBuiltinProvider, makeUpstreamMcpProvider, makeApiProvider, makeDatabaseProvider, makeIntegrationProvider])
).pipe(Layer.provide(Layer.mergeAll(ApiCaller.layer, DatabaseRunner.layer.pipe(Layer.provide(SqlDriversLive)))))
