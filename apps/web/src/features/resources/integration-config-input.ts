import type { ConfigDraft } from "./config-draft"

/** Credentials are referenced by secret id; OAuth2 also names the app's client id. Sign-in happens afterwards. */
const connection = (draft: ConfigDraft) => {
  switch (draft.connectionType) {
    case "none":
      return { type: "none" }
    case "oauth2":
      return { type: "oauth2", clientId: draft.clientId, clientSecretId: draft.secretId }
    default:
      return { type: draft.connectionType, secretId: draft.secretId }
  }
}

/** The candidate `IntegrationConfigInput` from the generic resource form. */
export const integrationConfigInput = (draft: ConfigDraft) => ({
  kind: "integration",
  pieceId: draft.pieceId,
  connection: connection(draft),
  ...(draft.limitActions ? { actions: draft.actions } : {})
})
