import { accountModeOf, type Actor, type IntegrationConfig, type Principal, type Resource, type ResourceId, UpstreamFailure } from "@pc/domain"
import type { RunAuth } from "@pc/integrations/rpc"
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { ConnectionResolver } from "../connections/resolver"
import { Secrets } from "../secrets/secrets"
import { IntegrationCatalog } from "./catalog"
import { oauthAppOf } from "./oauth/app"
import { OAuthTokens } from "./oauth/tokens"

const BasicCredentials = Schema.fromJsonString(Schema.Struct({ username: Schema.String, password: Schema.String }))
const CustomCredentials = Schema.fromJsonString(Schema.JsonObject)

/**
 * Token response fields pieces may read (Slack's `authed_user`, `team`, ...), without the refresh token: it
 * only ever serves apps/api's own refreshes and must not reach piece code or the integrations Worker.
 */
const runData = ({ refresh_token: _refresh, ...data }: Schema.JsonObject): Schema.JsonObject => data

/**
 * Resolves an integration's connection into the credentials for one run, from envelope-encrypted secrets
 * (each read audited as `secret.accessed`). OAuth2 tokens are refreshed first when about to expire. In
 * `per_user` mode the credential is the caller's own connection, never anyone else's.
 */
export class IntegrationCredentials extends Context.Service<IntegrationCredentials, {
  readonly forRun: (resource: Resource, config: IntegrationConfig, principal: Principal, actor: Actor) => Effect.Effect<RunAuth, UpstreamFailure>
}>()("api/integrations/IntegrationCredentials") {
  static readonly layer = Layer.effect(
    IntegrationCredentials,
    Effect.gen(function*() {
      const secrets = yield* Secrets
      const tokens = yield* OAuthTokens
      const catalog = yield* IntegrationCatalog
      const resolver = yield* ConnectionResolver

      const forRun = Effect.fn("IntegrationCredentials.forRun")(function*(resource: Resource, config: IntegrationConfig, principal: Principal, actor: Actor) {
        const failure = (message: string) => new UpstreamFailure({ upstream: resource.name, message })
        const perUser = accountModeOf(config) === "per_user"
        const own = resolver.credential(resource, principal, actor).pipe(
          Effect.catchTag("AccountNotConnected", () => Effect.fail(failure("connect your account first")))
        )
        /** The shared secret resource, or the caller's own pasted credential. */
        const reveal = (secretId: ResourceId | undefined) =>
          perUser
            ? Effect.flatMap(own, (stored) => (stored.type === "secret" ? Effect.succeed(Redacted.make(stored.value)) : Effect.fail(failure("the connection holds no secret"))))
            : secretId === undefined
            ? Effect.fail(failure("the integration's credential is missing"))
            : secrets.reveal(resource.orgId, secretId, "upstream_auth", actor).pipe(Effect.mapError(() => failure("the integration's credential is missing")))
        const connection = config.connection
        yield* Effect.annotateCurrentSpan({ "integration.connection": connection.type })
        switch (connection.type) {
          case "none":
            return { type: "none" } satisfies RunAuth
          case "secret_text":
            return { type: "secret_text", secret: yield* reveal(connection.secretId) } satisfies RunAuth
          case "basic": {
            const { username, password } = yield* Schema.decodeUnknownEffect(BasicCredentials)(Redacted.value(yield* reveal(connection.secretId))).pipe(
              Effect.mapError(() => failure("the connection secret must be JSON { \"username\": ..., \"password\": ... }"))
            )
            return { type: "basic", username, password: Redacted.make(password) } satisfies RunAuth
          }
          case "custom": {
            const props = yield* Schema.decodeUnknownEffect(CustomCredentials)(Redacted.value(yield* reveal(connection.secretId))).pipe(
              Effect.mapError(() => failure("the connection secret must be a JSON object of the connection's fields"))
            )
            const fields = Option.match(catalog.piece(config.pieceId), {
              onNone: () => [],
              onSome: (piece) => piece.auth.flatMap((auth) => (auth.type === "custom" ? auth.fields : []))
            })
            const missing = fields.filter((field) => field.required && !Object.hasOwn(props, field.name)).map((field) => field.name)
            if (missing.length > 0) return yield* failure(`the connection secret lacks ${missing.join(", ")}`)
            return { type: "custom", props: Redacted.make(props) } satisfies RunAuth
          }
          case "oauth2": {
            const app = yield* oauthAppOf(resource).pipe(
              Effect.provideService(IntegrationCatalog, catalog),
              Effect.mapError((invalid) => failure(invalid.message))
            )
            const current = perUser
              ? yield* Effect.flatMap(own, (stored) => (stored.type === "oauth" ? Effect.succeed(stored.tokens) : Effect.fail(failure("the connection holds no OAuth tokens"))))
              : yield* tokens.current(app, actor)
            return {
              type: "oauth2",
              accessToken: Redacted.make(current.accessToken),
              tokenType: current.tokenType,
              scope: current.scope,
              data: Redacted.make(runData(current.data)),
              props: app.props
            } satisfies RunAuth
          }
        }
      })

      return IntegrationCredentials.of({ forRun })
    })
  )
}
