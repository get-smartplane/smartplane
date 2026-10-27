import { type MachineToken, MachineTokenPrefix, Unauthorized } from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Redacted } from "effect"
import { HttpServerRequest } from "effect/http"
import { sha256Hex } from "../platform/encoding"
import { MachineTokensRepo } from "./machine-tokens-repo"

export const isMachineToken = (credential: Redacted.Redacted<string>): boolean => Redacted.value(credential).startsWith(MachineTokenPrefix)

const callerIp = Effect.map(
  Effect.serviceOption(HttpServerRequest.HttpServerRequest),
  Option.match({ onNone: () => null, onSome: (request) => request.headers["cf-connecting-ip"] ?? null })
)

/**
 * Authenticates `pcm_` machine tokens. Only `DeliveryAuthentication` calls this, which is what confines
 * machine tokens to the delivery endpoint: every other scheme (`Authentication`, `/mcp`) refuses them.
 */
export class MachineTokenAuthenticator extends Context.Service<MachineTokenAuthenticator, {
  readonly authenticate: (plaintext: Redacted.Redacted<string>) => Effect.Effect<MachineToken, Unauthorized>
}>()("api/delivery/MachineTokenAuthenticator") {
  static readonly layer = Layer.effect(
    MachineTokenAuthenticator,
    Effect.gen(function*() {
      const repo = yield* MachineTokensRepo
      const invalid = new Unauthorized({ reason: "invalid_credentials" })

      return MachineTokenAuthenticator.of({
        authenticate: Effect.fn("MachineTokenAuthenticator.authenticate")(function*(plaintext: Redacted.Redacted<string>) {
          if (!isMachineToken(plaintext)) return yield* invalid
          const found = yield* repo.findByHash(yield* Effect.promise(() => sha256Hex(Redacted.value(plaintext))))
          if (Option.isNone(found) || found.value.revokedAt !== null) return yield* invalid
          const token = found.value
          if (!DateTime.isGreaterThan(token.expiresAt, yield* DateTime.now)) return yield* new Unauthorized({ reason: "expired" })
          // Last use and IP feed access reviews (is this service still running, from where), not decisions.
          yield* repo.touch(token.id, yield* callerIp)
          yield* Effect.annotateCurrentSpan({ "org.id": token.orgId, "principal.kind": "MachineToken", "machine_token.id": token.id })
          return token
        })
      })
    })
  )
}
