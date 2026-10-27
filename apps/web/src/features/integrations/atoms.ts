import type { OAuthReturnTo, PieceId, ResourceId } from "@pc/domain"
import { Effect } from "effect"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

/** The whole curated catalog (a few dozen pieces), filtered on screen as people type. */
export const catalogAtom = apiQuery([], (api) => api.integrations.listCatalog({ query: {} }))

/** A piece with its connection methods and every action; bundled, so it never changes while the app runs. */
export const pieceAtom = Atom.family((pieceId: PieceId) => apiQuery([], (api) => api.integrations.getPiece({ params: { pieceId } })))

/** The redirect URI each org registers on its OAuth apps. */
export const oauthSettingsAtom = apiQuery([], (api) => api.integrations.oauthSettings())

/**
 * Starting a flow changes nothing until the provider calls back, so it invalidates nothing. `returnTo` sends
 * the browser back to that page (the setup flow) instead of the integration's own.
 */
export const startOAuthAtom = apiMutation([], (api, { id, returnTo }: { readonly id: ResourceId; readonly returnTo?: OAuthReturnTo }) =>
  api.integrations.startOAuth({ params: { id }, query: returnTo === undefined ? {} : { returnTo } })
)

/** Deletes the token secret too, so resources refresh. */
export const disconnectOAuthAtom = apiMutation(["resources"], (api, id: ResourceId) =>
  api.integrations.disconnectOAuth({ params: { id } })
)

/** The piece behind a resource, when it is an integration; `null` otherwise, so callers need no branching hooks. */
export const optionalPieceAtom = Atom.family((pieceId: PieceId | null) =>
  apiQuery([], (api) => (pieceId === null ? Effect.succeed(null) : api.integrations.getPiece({ params: { pieceId } })))
)
