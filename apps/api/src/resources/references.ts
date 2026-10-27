import { type EditableResourceConfig, InvalidInput, NotFound, type OrgId, type ResourceId, type ResourceKind } from "@pc/domain"
import { Effect, Option } from "effect"
import { ResourcesRepo } from "./resources-repo"

/** Resource ids a config points at, with the kind each must have. */
const referencesOf = (config: EditableResourceConfig): ReadonlyArray<readonly [ResourceId, ResourceKind]> => {
  switch (config.kind) {
    case "mcp_server": {
      const auth = config.auth
      const secretId = auth?.type === "secret" ? auth.secretId : auth?.type === "oauth" ? auth.clientSecretId : undefined
      return secretId === undefined ? [] : [[secretId, "secret"]]
    }
    case "api":
      return config.authSecretId === undefined ? [] : [[config.authSecretId, "secret"]]
    case "database":
      return [[config.connectionSecretId, "secret"]]
    case "tool":
      return [[config.serverId, "mcp_server"]]
    case "integration":
      switch (config.connection.type) {
        case "none":
          return []
        case "oauth2":
          return [[config.connection.clientSecretId, "secret"]]
        default:
          return config.connection.secretId === undefined ? [] : [[config.connection.secretId, "secret"]]
      }
    case "skill":
      return config.source === "github" && config.tokenSecretId !== undefined ? [[config.tokenSecretId, "secret"]] : []
    case "variable":
      return []
  }
}

/** Credentials are referenced, never inlined: every referenced resource must exist in the org with the right kind. */
export const checkReferences = (
  orgId: OrgId,
  config: EditableResourceConfig
): Effect.Effect<void, NotFound | InvalidInput, ResourcesRepo> =>
  Effect.forEach(referencesOf(config), ([id, kind]) =>
    Effect.gen(function*() {
      const found = yield* ResourcesRepo.use((repo) => repo.find(orgId, id))
      if (Option.isNone(found)) return yield* new NotFound({ entity: "resource", id })
      if (found.value.config.kind !== kind) {
        return yield* new InvalidInput({ message: `resource ${id} must be a ${kind}`, field: "config" })
      }
    }), { discard: true })
