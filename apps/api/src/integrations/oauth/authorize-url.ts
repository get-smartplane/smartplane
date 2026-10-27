import type { OAuth2Connection, OAuth2PieceAuth } from "@pc/domain"

export interface AuthorizeRequest {
  readonly auth: OAuth2PieceAuth
  readonly connection: OAuth2Connection | Omit<OAuth2Connection, "status">
  readonly authUrl: string
  /** The piece's scopes with placeholders filled (`OAuthApp.scopes`). */
  readonly scopes: ReadonlyArray<string>
  readonly redirectUri: string
  readonly state: string
  readonly codeChallenge: string | null
}

/**
 * The provider's authorize URL, built the way Activepieces builds it: offline access and a consent prompt
 * (so a refresh token is issued) unless the piece says otherwise, plus the piece's own extra parameters.
 */
export const authorizeUrl = ({ auth, connection, authUrl, scopes, redirectUri, state, codeChallenge }: AuthorizeRequest): string => {
  const url = new URL(authUrl)
  const params = url.searchParams
  params.set("response_type", "code")
  params.set("client_id", connection.clientId)
  params.set("redirect_uri", redirectUri)
  params.set("state", state)
  if (scopes.length > 0) params.set("scope", scopes.join(" "))
  params.set("access_type", "offline")
  if (auth.prompt !== "omit") params.set("prompt", auth.prompt ?? "consent")
  if (codeChallenge !== null && auth.pkce !== null) {
    params.set("code_challenge", codeChallenge)
    params.set("code_challenge_method", auth.pkce)
  }
  for (const [key, value] of Object.entries(auth.extraParams)) params.set(key, value)
  return url.toString()
}
