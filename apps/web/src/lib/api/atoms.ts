import type { Effect } from "effect"
import { ApiClient, type ApiClientShape } from "./client"
import { toApiError } from "./errors"
import { runtime } from "./runtime"

/** Reactivity keys: a mutation invalidates keys, and every query tagged with one refetches. */
export type QueryKey =
  | "me"
  | "members"
  | "roles"
  | "teams"
  | "projects"
  | "resources"
  | "grants"
  | "guards"
  | "approvals"
  | "tokens"
  | "audit"
  | "org"
  | "reviews"
  | "connections"
  | "skills"
  | "onboarding"
  | "machineTokens"

/** A cached query atom that refetches whenever one of `keys` is invalidated. */
export const apiQuery = <A, E>(keys: ReadonlyArray<QueryKey>, call: (api: ApiClientShape) => Effect.Effect<A, E>) =>
  runtime.atom(toApiError(ApiClient.use(call))).pipe(runtime.factory.withReactivity(keys))

/** A mutation atom; on success it invalidates `keys` so dependent queries refresh. */
export const apiMutation = <Arg, A, E>(
  keys: ReadonlyArray<QueryKey>,
  call: (api: ApiClientShape, arg: Arg) => Effect.Effect<A, E>
) => runtime.fn((arg: Arg) => toApiError(ApiClient.use((api) => call(api, arg))), { reactivityKeys: keys })
