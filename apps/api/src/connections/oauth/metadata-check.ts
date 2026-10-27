import { Result } from "effect"
import type { AuthServerMetadata } from "./discovery"
import { sameHost, sameIssuer, screenOAuthEndpoint } from "./endpoint-screen"

/** What of the metadata Smartplane will use once it passed `checkAuthServerMetadata`. */
export interface CheckedEndpoints {
  /** Present only when it is HTTPS on the issuer's own host: the access token is sent there. */
  readonly userinfoUrl: string | undefined
}

/**
 * Refuses authorization-server metadata Smartplane must not act on: an `issuer` other than the server it was
 * fetched for (RFC 8414 §3.3), or an issuer, authorization, token or registration endpoint that fails the
 * endpoint screen. A userinfo endpoint that fails it, or lives on another host than the issuer, is dropped
 * (identity then comes from the `id_token` alone) rather than sent the access token.
 */
export const checkAuthServerMetadata = (
  metadata: AuthServerMetadata,
  authorizationServerUrl: string,
  environment: string
): Result.Result<CheckedEndpoints, string> => {
  if (!sameIssuer(metadata.issuer, authorizationServerUrl)) {
    return Result.fail(`the authorization server's metadata names issuer ${metadata.issuer}, not ${authorizationServerUrl}`)
  }
  const endpoints: ReadonlyArray<readonly [string, string | undefined]> = [
    ["issuer", metadata.issuer],
    ["authorization_endpoint", metadata.authorization_endpoint],
    ["token_endpoint", metadata.token_endpoint],
    ["registration_endpoint", metadata.registration_endpoint]
  ]
  for (const [name, url] of endpoints) {
    if (url === undefined) continue
    const screened = screenOAuthEndpoint(url, environment)
    if (Result.isFailure(screened)) return Result.fail(`the authorization server's ${name} is refused: ${screened.failure}`)
  }
  const userinfo = metadata.userinfo_endpoint
  const userinfoUrl = userinfo !== undefined && Result.isSuccess(screenOAuthEndpoint(userinfo, environment)) && sameHost(userinfo, metadata.issuer)
    ? userinfo
    : undefined
  return Result.succeed({ userinfoUrl })
}
