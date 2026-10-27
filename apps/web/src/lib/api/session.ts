import { Context, Effect, Layer, Schema } from "effect"
import { HttpClient } from "effect/http"
import { apiOrigin } from "./http"
import { toApiError, type TransportFailure } from "./errors"

const LogoutResponse = Schema.Struct({ redirect: Schema.String })

/** Browser auth routes (`/auth/*`) live outside the HttpApi contract; this is their typed edge. */
export class AuthSession extends Context.Service<
  AuthSession,
  { readonly logout: Effect.Effect<string, TransportFailure> }
>()("@pc/web/AuthSession") {
  static readonly layer = Layer.effect(
    AuthSession,
    Effect.gen(function*() {
      const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
      const logout = client.post(`${apiOrigin}/auth/logout`).pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(Schema.decodeUnknownEffect(LogoutResponse)),
        Effect.map(({ redirect }) => redirect),
        toApiError
      )
      return { logout }
    })
  )
}

export const loginUrl = (options?: { readonly signup?: boolean }) =>
  options?.signup ? "/auth/login?signup=1" : "/auth/login"
