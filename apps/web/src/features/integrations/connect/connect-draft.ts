import type { AuthField, IntegrationPiece, PieceAuth, ProjectId } from "@pc/domain"
import { Redacted } from "effect"

/** Raw values of the connect form; `toConnectInput` shapes them for the piece's schema. */
export interface ConnectDraft {
  readonly method: PieceAuth["type"] | "none"
  readonly name: string
  readonly description: string
  readonly projectId: ProjectId | null
  readonly secret: string
  readonly username: string
  readonly password: string
  /** Custom fields, or an OAuth2 piece's non-secret props (e.g. a subdomain), by field name. */
  readonly fields: Readonly<Record<string, string | boolean>>
  readonly clientId: string
  readonly clientSecret: string
  /** Reuse an OAuth client secret already stored, instead of pasting it again. */
  readonly storedSecretId: string
  readonly useStoredSecret: boolean
  /** Off: every supported action, including ones a later piece version adds. */
  readonly limitActions: boolean
  readonly actions: ReadonlyArray<string>
}

/** Pasting a key is the quickest way in, so it is the default when a piece offers it. */
const defaultMethod = (piece: IntegrationPiece): ConnectDraft["method"] =>
  piece.auth.find((auth) => auth.type === "secret_text")?.type ?? piece.auth[0]?.type ?? "none"

export const initialDraft = (piece: IntegrationPiece): ConnectDraft => ({
  method: defaultMethod(piece),
  name: piece.displayName,
  description: "",
  projectId: null,
  secret: "",
  username: "",
  password: "",
  fields: {},
  clientId: "",
  clientSecret: "",
  storedSecretId: "",
  useStoredSecret: false,
  limitActions: false,
  actions: []
})

export const authFor = (piece: IntegrationPiece, method: ConnectDraft["method"]): PieceAuth | undefined =>
  piece.auth.find((auth) => auth.type === method)

/** Blank optional fields are left out; numbers and secrets get their types so the schema can judge them. */
const fieldEntry = (field: AuthField, values: ConnectDraft["fields"]): ReadonlyArray<readonly [string, unknown]> => {
  const value = values[field.name] ?? (field.kind === "checkbox" ? false : "")
  if (typeof value === "boolean") return [[field.name, value]]
  if (value === "" && !field.required) return []
  if (field.kind === "number") return [[field.name, value === "" ? value : Number(value)]]
  // Wrapped at once so a pasted credential cannot leak through error formatting.
  return [[field.name, field.kind === "secret" ? Redacted.make(value) : value]]
}

const fieldInput = (fields: ReadonlyArray<AuthField>, values: ConnectDraft["fields"]) =>
  Object.fromEntries(fields.flatMap((field) => fieldEntry(field, values)))

const connectionInput = (auth: PieceAuth | undefined, draft: ConnectDraft) => {
  switch (auth?.type) {
    case undefined:
      return { type: "none" }
    case "secret_text":
      return { type: auth.type, secret: Redacted.make(draft.secret) }
    case "basic":
      return { type: auth.type, username: draft.username, password: Redacted.make(draft.password) }
    case "custom":
      return { type: auth.type, fields: fieldInput(auth.fields, draft.fields) }
    case "oauth2":
      return {
        type: auth.type,
        clientId: draft.clientId,
        clientSecret: draft.useStoredSecret ? { secretId: draft.storedSecretId } : { value: Redacted.make(draft.clientSecret) },
        props: fieldInput(auth.fields, draft.fields)
      }
  }
}

/** The candidate `ConnectInput`; the piece's schema decides whether it is valid. */
export const toConnectInput = (auth: PieceAuth | undefined, draft: ConnectDraft) => ({
  name: draft.name,
  description: draft.description,
  projectId: draft.projectId,
  ...(draft.limitActions ? { actions: draft.actions } : {}),
  connection: connectionInput(auth, draft)
})
