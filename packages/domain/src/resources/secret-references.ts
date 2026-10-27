import type { ResourceId } from "../ids"
import type { ResourceConfig } from "./config"

const present = (ids: ReadonlyArray<ResourceId | undefined>): ReadonlyArray<ResourceId> =>
  ids.filter((id): id is ResourceId => id !== undefined)

/** The `secret` resources a stored config uses, including the token secret Smartplane manages for OAuth2 integrations. */
export const secretReferences = (config: ResourceConfig): ReadonlyArray<ResourceId> => {
  switch (config.kind) {
    case "mcp_server":
      return present([config.auth?.type === "secret" ? config.auth.secretId : config.auth?.type === "oauth" ? config.auth.clientSecretId : undefined])
    case "api":
      return present([config.authSecretId])
    case "database":
      return [config.connectionSecretId]
    case "integration": {
      const connection = config.connection
      if (connection.type === "none") return []
      if (connection.type === "oauth2") return present([connection.clientSecretId, connection.tokenSecretId])
      return present([connection.secretId])
    }
    case "skill":
      return config.source === "github" ? present([config.tokenSecretId]) : []
    case "tool":
    case "secret":
    case "variable":
      return []
  }
}
