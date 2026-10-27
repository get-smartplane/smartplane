import { ActionName, type AuthField, Description, Name, type PieceAuth, ProjectId, ResourceId, SecretValue } from "@pc/domain"
import { Schema } from "effect"

const Text = Schema.Trimmed.check(Schema.isBetweenLength(1, 512))

const fieldValue = (field: AuthField) => {
  switch (field.kind) {
    case "secret":
      return SecretValue
    case "number":
      return Schema.Finite
    case "checkbox":
      return Schema.Boolean
    case "select":
    case "text":
    case "long_text":
      return Text
  }
}

/** One schema per piece form, so each of its declared fields is checked (and reported) on its own. */
const fieldsSchema = (fields: ReadonlyArray<AuthField>) =>
  Schema.Struct(
    Object.fromEntries(fields.map((field) => [field.name, field.required ? fieldValue(field) : Schema.optionalKey(fieldValue(field))]))
  )

/** A new client secret to store, or one already stored (several integrations can share one OAuth app). */
const ClientSecret = Schema.Union([Schema.Struct({ value: SecretValue }), Schema.Struct({ secretId: ResourceId })])

/**
 * What the connect form collects before anything is stored. Credentials stay `Redacted` until they are
 * sent as a new secret resource; the integration then references that secret by id.
 */
const connectionSchema = (auth: PieceAuth | undefined) => {
  if (auth === undefined) return Schema.Struct({ type: Schema.tag("none") })
  switch (auth.type) {
    case "secret_text":
      return Schema.Struct({ type: Schema.tag("secret_text"), secret: SecretValue })
    case "basic":
      return Schema.Struct({ type: Schema.tag("basic"), username: Text, password: SecretValue })
    case "custom":
      return Schema.Struct({ type: Schema.tag("custom"), fields: fieldsSchema(auth.fields) })
    case "oauth2":
      return Schema.Struct({ type: Schema.tag("oauth2"), clientId: Text, clientSecret: ClientSecret, props: fieldsSchema(auth.fields) })
  }
}

export const connectSchema = (auth: PieceAuth | undefined) =>
  Schema.Struct({
    name: Name,
    description: Description,
    projectId: Schema.NullOr(ProjectId),
    actions: Schema.optionalKey(Schema.NonEmptyArray(ActionName)),
    connection: connectionSchema(auth)
  })

export type ConnectInput = ReturnType<typeof connectSchema>["Type"]
export type PendingConnection = ConnectInput["connection"]

/** Copy for the fields a person is most likely to miss. */
export const connectMessages = (auth: PieceAuth | undefined): Readonly<Record<string, string>> => {
  const fields = auth?.type === "custom" || auth?.type === "oauth2" ? auth.fields : []
  return {
    name: "Enter a name between 1 and 80 characters.",
    "connection.secret": "Paste the key or token.",
    "connection.username": "Enter the username.",
    "connection.password": "Enter the password.",
    "connection.clientId": "Enter the OAuth app's client ID.",
    "connection.clientSecret": "Paste the client secret, or pick a stored one under Advanced options.",
    ...Object.fromEntries(fields.map((field) => [`connection.${auth?.type === "custom" ? "fields" : "props"}.${field.name}`, `Enter ${field.displayName}.`]))
  }
}
