import type {
  AuthorizationServerChanged,
  Conflict,
  Forbidden,
  InvalidInput,
  ModelTimedOut,
  NotFound,
  PolicyDenied,
  Unauthorized,
  UpstreamFailure
} from "@pc/domain"
import { Data, Effect, Schema } from "effect"
import { HttpClientError } from "effect/http"

/** The API could not be reached, or answered with something outside the contract. */
export class TransportFailure extends Data.TaggedError("TransportFailure")<{ readonly message: string }> {}

export type ApiError =
  | Unauthorized
  | Forbidden
  | NotFound
  | Conflict
  | InvalidInput
  | PolicyDenied
  | UpstreamFailure
  | ModelTimedOut
  | AuthorizationServerChanged
  | TransportFailure

type ClientFailure = HttpClientError.HttpClientError | Schema.SchemaError

const isClientFailure = (error: unknown): error is ClientFailure =>
  HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error)

/** Folds transport and decoding failures into one tagged error so every UI state stays typed. */
export const toApiError = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.catchIf<E, Extract<E, ClientFailure>, never, TransportFailure, never>(
      (error): error is Extract<E, ClientFailure> => isClientFailure(error),
      () => Effect.fail(new TransportFailure({ message: "The server could not be reached." }))
    )
  )
