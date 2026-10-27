import type { IntegrationConfig, IntegrationConfigInput, IntegrationConnectionInput } from "@pc/domain"

/** The editable form of a stored connection: OAuth2 status and token are Smartplane's, never sent back. */
const connectionInput = (connection: IntegrationConfig["connection"]): IntegrationConnectionInput => {
  if (connection.type !== "oauth2") return connection
  const { clientId, clientSecretId, props } = connection
  return { type: "oauth2", clientId, clientSecretId, ...(props === undefined ? {} : { props }) }
}

/** The same config as input, with a new action allow-list (`undefined`: every supported action). */
export const withActions = (config: IntegrationConfig, actions: ReadonlyArray<string> | undefined) => {
  const input: IntegrationConfigInput = { kind: "integration", pieceId: config.pieceId, connection: connectionInput(config.connection) }
  return actions === undefined ? input : { ...input, actions }
}
