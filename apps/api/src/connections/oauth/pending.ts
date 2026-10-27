import { OAuthReturnTo, OrgId, ResourceId, UserId } from "@pc/domain"
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { StateTtlSeconds } from "../../integrations/oauth/state-store"
import { SingleUseStore, singleUseStates } from "../../platform/single-use-states"
import { Envelope, open, seal } from "../../secrets/envelope"
import { KeyRing } from "../../secrets/key-ring"
import { type ConnectionClient, ConnectionClientJson } from "../credential"

/** One connection sign-in in flight. The client is sealed: a dynamically registered client's secret is a secret. */
const PendingConnectionRow = Schema.Struct({
  orgId: OrgId,
  resourceId: ResourceId,
  /** Who started it; only their dashboard session can finish it. */
  userId: UserId,
  /** Whose connection it becomes: `null` for the shared account. */
  owner: Schema.NullOr(UserId),
  /** The resource's auth settings when the flow started; a change in between invalidates the flow. */
  fingerprint: Schema.String,
  codeVerifier: Schema.NullOr(Schema.String),
  tokenUrl: Schema.String,
  refreshUrl: Schema.optionalKey(Schema.String),
  resource: Schema.optionalKey(Schema.String),
  userinfoUrl: Schema.optionalKey(Schema.String),
  /** The MCP authorization server's issuer, pinned for an admin-supplied client when the sign-in succeeds. */
  issuer: Schema.optionalKey(Schema.String),
  /** The dashboard page to land on afterwards, when not the resource's own. */
  returnTo: Schema.optionalKey(OAuthReturnTo),
  client: Envelope
})

export type PendingConnection = Omit<typeof PendingConnectionRow.Type, "client"> & { readonly client: ConnectionClient }

const encodeClient = Schema.encodeEffect(ConnectionClientJson)
const decodeClient = Schema.decodeUnknownEffect(ConnectionClientJson)

/** Pending connection sign-ins by OAuth `state`, single use, for 10 minutes. */
export class PendingConnections extends Context.Service<PendingConnections, {
  readonly put: (state: string, pending: PendingConnection) => Effect.Effect<void>
  readonly take: (state: string) => Effect.Effect<Option.Option<PendingConnection>>
}>()("api/connections/PendingConnections") {
  static readonly layer = Layer.effect(
    PendingConnections,
    Effect.gen(function*() {
      const keys = yield* KeyRing
      const states = singleUseStates(yield* SingleUseStore, "connection-state:v1", PendingConnectionRow, StateTtlSeconds)
      return PendingConnections.of({
        put: Effect.fn("PendingConnections.put")(function*(state: string, pending: PendingConnection) {
          const client = yield* seal(keys.current, Redacted.make(yield* Effect.orDie(encodeClient(pending.client))))
          yield* states.put(state, { ...pending, client })
        }),
        take: Effect.fn("PendingConnections.take")(function*(state: string) {
          const row = yield* states.take(state)
          if (Option.isNone(row)) return Option.none()
          const kek = Option.getOrElse(keys.find(row.value.client.kekId), () => keys.current)
          const client = yield* open(kek, row.value.client).pipe(
            Effect.flatMap((plaintext) => decodeClient(Redacted.value(plaintext))),
            Effect.option
          )
          return Option.map(client, (opened): PendingConnection => ({ ...row.value, client: opened }))
        })
      })
    })
  )
}
