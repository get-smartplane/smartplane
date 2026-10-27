import { type Actor, type OrgId, UpstreamFailure } from "@pc/domain"
import { Effect, Redacted } from "effect"
import type { OAuthClient } from "../../integrations/oauth/token-endpoint"
import { Secrets } from "../../secrets/secrets"
import type { ConnectionClient } from "../credential"

/**
 * The client to present at the token endpoint. A dynamically registered client's secret travels inside the
 * encrypted credential; an admin-supplied client's secret is read (audited) from its `secret` resource.
 */
export const oauthClientOf = (orgId: OrgId, client: ConnectionClient, actor: Actor): Effect.Effect<OAuthClient, UpstreamFailure, Secrets> =>
  Effect.gen(function*() {
    if (client.authentication === "none") return { clientId: client.clientId, authentication: "none" } satisfies OAuthClient
    const { clientSecret, clientSecretId } = client
    const missing = (message: string) => new UpstreamFailure({ upstream: "oauth", message })
    const secret = clientSecret !== undefined
      ? Redacted.make(clientSecret)
      : clientSecretId === undefined
      ? yield* missing("the OAuth client has no secret")
      : yield* Secrets.use((secrets) => secrets.reveal(orgId, clientSecretId, "oauth_client", actor)).pipe(
        Effect.mapError(() => missing("the OAuth client's secret is missing"))
      )
    return { clientId: client.clientId, clientSecret: secret, authentication: client.authentication } satisfies OAuthClient
  })
