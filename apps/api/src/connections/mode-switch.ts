import { type AccountMode, InvalidInput, ResourceConfig, type ResourceId } from "@pc/domain"
import { Effect, Schema } from "effect"

const validate = Schema.decodeUnknownEffect(Schema.toType(ResourceConfig))

/**
 * The config with another account mode. Going per-user drops the shared secret reference (each member brings
 * their own) and disconnects a shared OAuth2 integration; going shared with a secret-based method needs the admin to pick the shared secret in the
 * resource's settings, so it is refused rather than left without a credential.
 */
export const withAccountMode = (config: ResourceConfig, accountMode: AccountMode): Effect.Effect<ResourceConfig, InvalidInput> => {
  const next = (() => {
    switch (config.kind) {
      case "mcp_server": {
        if (accountMode === "shared" || config.auth?.type !== "secret") return { ...config, accountMode }
        const { secretId: _shared, ...auth } = config.auth
        return { ...config, accountMode, auth }
      }
      case "api": {
        const { authSecretId: _shared, ...rest } = config
        return accountMode === "shared" ? { ...config, accountMode } : { ...rest, accountMode }
      }
      case "integration": {
        if (accountMode === "shared" || config.connection.type === "none") return { ...config, accountMode }
        if (config.connection.type === "oauth2") {
          // The shared account's tokens go with it (see `retiredTokenSecret`); members sign in on their own.
          const { tokenSecretId: _shared, ...connection } = config.connection
          return { ...config, accountMode, connection: { ...connection, status: "not_connected" as const } }
        }
        const { secretId: _shared, ...connection } = config.connection
        return { ...config, accountMode, connection }
      }
      default:
        return undefined
    }
  })()
  if (next === undefined) return Effect.fail(new InvalidInput({ message: `a ${config.kind} has no account to connect`, field: "mode" }))
  return validate(next).pipe(
    Effect.mapError(() => new InvalidInput({ message: "a shared account needs its secret: choose it in the resource's settings", field: "mode" }))
  )
}

/**
 * The managed token secret of a shared OAuth2 integration that is going per-user. It holds the shared
 * account's live tokens, so it is deleted with the switch rather than left for a later switch back to reuse.
 */
export const retiredTokenSecret = (config: ResourceConfig, accountMode: AccountMode): ResourceId | null =>
  accountMode === "per_user" && config.kind === "integration" && config.connection.type === "oauth2"
    ? config.connection.tokenSecretId ?? null
    : null
