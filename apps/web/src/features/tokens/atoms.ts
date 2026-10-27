import type { AccessTokenId, CreateAccessToken } from "@pc/domain"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export type TokenScope = "mine" | "all"

export const tokensAtom = Atom.family((scope: TokenScope) =>
  apiQuery(["tokens"], (api) => api.tokens.list({ query: { scope } }))
)

export const createTokenAtom = apiMutation(["tokens"], (api, payload: CreateAccessToken) => api.tokens.create({ payload }))

export const revokeTokenAtom = apiMutation(["tokens"], (api, id: AccessTokenId) => api.tokens.revoke({ params: { id } }))
