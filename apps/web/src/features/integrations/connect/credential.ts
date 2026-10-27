import type { IntegrationConnectionInput, ResourceId } from "@pc/domain"
import { Redacted } from "effect"
import type { PendingConnection } from "./connect-schema"

const reveal = (value: unknown): unknown => (Redacted.isRedacted(value) ? Redacted.value(value) : value)

/**
 * The value of the secret resource a connection needs, in the shape the piece reads: the key itself, or a
 * JSON object for basic and custom credentials. `null` when nothing new has to be stored.
 */
export const credentialOf = (connection: PendingConnection): Redacted.Redacted<string> | null => {
  switch (connection.type) {
    case "none":
      return null
    case "secret_text":
      return connection.secret
    case "basic":
      return Redacted.make(JSON.stringify({ username: connection.username, password: Redacted.value(connection.password) }))
    case "custom":
      return Redacted.make(JSON.stringify(Object.fromEntries(Object.entries(connection.fields).map(([name, value]) => [name, reveal(value)]))))
    case "oauth2":
      return "value" in connection.clientSecret ? connection.clientSecret.value : null
  }
}

/** What the new secret is called under Secrets & variables, so people can tell what it unlocks. */
export const credentialName = (integrationName: string, connection: PendingConnection): string =>
  `${integrationName.slice(0, 56)} ${connection.type === "oauth2" ? "OAuth client secret" : "credentials"}`

/** OAuth2 props are text at the provider (they fill URL templates); numbers and switches are written out, secrets never travel here. */
const textProps = (props: Readonly<Record<string, unknown>>) => {
  const entries = Object.entries(props).flatMap(([name, value]) =>
    typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? [[name, String(value)] as const] : []
  )
  return entries.length === 0 ? {} : { props: Object.fromEntries(entries) }
}

/** The stored connection, referencing the secret by id (`storedId`: the one just created, if any). */
export const connectionInput = (connection: PendingConnection, storedId: ResourceId | null): IntegrationConnectionInput | null => {
  switch (connection.type) {
    case "none":
      return { type: "none" }
    case "secret_text":
    case "basic":
    case "custom":
      return storedId === null ? null : { type: connection.type, secretId: storedId }
    case "oauth2": {
      const clientSecretId = "secretId" in connection.clientSecret ? connection.clientSecret.secretId : storedId
      return clientSecretId === null ? null : { type: "oauth2", clientId: connection.clientId, clientSecretId, ...textProps(connection.props) }
    }
  }
}
