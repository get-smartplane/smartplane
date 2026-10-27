import { type Actor, type DatabaseConfig, type Resource, UpstreamFailure } from "@pc/domain"
import { Context, Duration, Effect, Layer, Redacted } from "effect"
import { Secrets } from "../../secrets/secrets"
import { type SqlResult, type SqlStatement, SqlDrivers } from "./driver"

/** Server-side statement timeout; the gateway gives up a little later to allow for connecting. */
export const StatementTimeoutMs = 10_000
const GatewayTimeout = Duration.millis(StatementTimeoutMs + 5_000)

/** Driver errors can echo connection details; the password never leaves this module. */
const redact = (message: string, connection: Redacted.Redacted<string>): string => {
  const raw = Redacted.value(connection)
  let password = ""
  try {
    password = decodeURIComponent(new URL(raw).password)
  } catch {
    password = ""
  }
  const scrubbed = message.split(raw).join("[connection]")
  return password.length > 0 ? scrubbed.split(password).join("[redacted]") : scrubbed
}

/** Runs one statement against a database resource with its connection string injected from the secret. */
export class DatabaseRunner extends Context.Service<DatabaseRunner, {
  readonly run: (
    resource: Resource,
    config: typeof DatabaseConfig.Type,
    actor: Actor,
    statement: SqlStatement,
    limits: { readonly readOnly: boolean; readonly maxRows: number }
  ) => Effect.Effect<SqlResult, UpstreamFailure>
}>()("api/gateway-tools/DatabaseRunner") {
  static readonly layer = Layer.effect(
    DatabaseRunner,
    Effect.gen(function*() {
      const secrets = yield* Secrets
      const drivers = yield* SqlDrivers

      const run = Effect.fn("DatabaseRunner.run")(function*(
        resource: Resource,
        config: typeof DatabaseConfig.Type,
        actor: Actor,
        statement: SqlStatement,
        limits: { readonly readOnly: boolean; readonly maxRows: number }
      ) {
        yield* Effect.annotateCurrentSpan({ "db.system.name": config.engine, "db.resource": resource.id, "db.read_only": limits.readOnly })
        const failure = (message: string) => new UpstreamFailure({ upstream: resource.name, message })
        const connection = yield* secrets.reveal(resource.orgId, config.connectionSecretId, "upstream_auth", actor).pipe(
          Effect.mapError(() => failure("the database's connection secret is missing"))
        )
        const result = yield* Effect.tryPromise({
          try: () => drivers[config.engine].execute(connection, statement, { ...limits, timeoutMs: StatementTimeoutMs }),
          catch: (cause) => failure(redact(cause instanceof Error ? cause.message : String(cause), connection))
        }).pipe(Effect.timeoutOrElse({ duration: GatewayTimeout, orElse: () => Effect.fail(failure("timed out")) }))
        yield* Effect.annotateCurrentSpan({ "db.response.returned_rows": result.rows.length, "db.truncated": result.truncated })
        return result
      })

      return DatabaseRunner.of({ run })
    })
  )
}
