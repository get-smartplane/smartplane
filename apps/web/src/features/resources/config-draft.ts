import { defaultApiMethods, type ApiMethod, type ResourceKind } from "@pc/domain"
import { Redacted } from "effect"
import type { FieldErrors } from "@/lib/forms/decode-form"
import { integrationConfigInput } from "./integration-config-input"

/** One prompt argument row; `key` only keeps React rows stable while names are edited. */
export interface SkillArgumentDraft {
  readonly key: number
  readonly name: string
  readonly description: string
  readonly required: boolean
}

/** Raw form values for every kind's config; `toConfigInput` shapes the ones a kind uses for decoding. */
export interface ConfigDraft {
  readonly url: string
  readonly transport: string
  readonly authSecretId: string
  readonly serverId: string
  readonly toolName: string
  readonly skillDescription: string
  readonly body: string
  readonly skillArguments: ReadonlyArray<SkillArgumentDraft>
  readonly engine: string
  readonly connectionSecretId: string
  readonly readOnly: boolean
  readonly baseUrl: string
  readonly authHeader: string
  readonly allowedMethods: ReadonlyArray<ApiMethod>
  /** One path prefix per line. */
  readonly allowedPaths: string
  readonly value: string
  readonly pieceId: string
  /** An `IntegrationAuthType`; the schema rejects one the piece does not offer. */
  readonly connectionType: string
  /** The secret a credential connection reads, or an OAuth2 app's client secret. */
  readonly secretId: string
  readonly clientId: string
  readonly limitActions: boolean
  readonly actions: ReadonlyArray<string>
}

export const emptyDraft: ConfigDraft = {
  url: "",
  transport: "streamable_http",
  authSecretId: "",
  serverId: "",
  toolName: "",
  skillDescription: "",
  body: "",
  skillArguments: [],
  engine: "postgres",
  connectionSecretId: "",
  readOnly: true,
  baseUrl: "",
  authHeader: "",
  allowedMethods: defaultApiMethods,
  allowedPaths: "",
  value: "",
  pieceId: "",
  connectionType: "",
  secretId: "",
  clientId: "",
  limitActions: false,
  actions: []
}

export interface ConfigFieldsProps {
  readonly draft: ConfigDraft
  readonly set: <K extends keyof ConfigDraft>(key: K, value: ConfigDraft[K]) => void
  /** Keyed by schema path, e.g. `config.url`. */
  readonly errors: FieldErrors
}

/** Optional config keys are omitted when blank rather than sent as "". */
const optional = (key: string, value: string): Readonly<Record<string, string>> => (value === "" ? {} : { [key]: value })

/** Blank lines are ignored; no prefixes at all means any path under the base URL. */
const pathPrefixes = (text: string): Readonly<Record<string, ReadonlyArray<string>>> => {
  const paths = text.split("\n").map((line) => line.trim()).filter((line) => line !== "")
  return paths.length === 0 ? {} : { allowedPaths: paths }
}

/** Rows become `arguments` only when there are any, so argument-free skills store exactly what they did before. */
const skillArguments = (rows: ReadonlyArray<SkillArgumentDraft>): Readonly<Record<string, unknown>> =>
  rows.length === 0
    ? {}
    : { arguments: rows.map((row) => ({ name: row.name, ...optional("description", row.description.trim()), ...(row.required ? { required: true } : {}) })) }

/** The candidate `config` for `CreateResource`; the domain schema decides whether it is valid. */
export const toConfigInput = (kind: ResourceKind, draft: ConfigDraft): Readonly<Record<string, unknown>> => {
  switch (kind) {
    case "mcp_server":
      return { kind, url: draft.url, transport: draft.transport, ...(draft.authSecretId === "" ? {} : { auth: { type: "secret", secretId: draft.authSecretId } }) }
    case "tool":
      return { kind, serverId: draft.serverId, toolName: draft.toolName }
    case "skill":
      // Only "Write" skills are created here; GitHub, link and upload skills go through /api/skills (features/skills).
      return { kind, source: "inline", description: draft.skillDescription, body: draft.body, ...skillArguments(draft.skillArguments) }
    case "database":
      return { kind, engine: draft.engine, connectionSecretId: draft.connectionSecretId, readOnly: draft.readOnly }
    case "api":
      return {
        kind,
        baseUrl: draft.baseUrl,
        ...optional("authSecretId", draft.authSecretId),
        ...optional("authHeader", draft.authHeader),
        allowedMethods: draft.allowedMethods,
        ...pathPrefixes(draft.allowedPaths)
      }
    case "secret":
      // Wrapped immediately so the plaintext cannot leak through logs or error formatting.
      return { kind, value: Redacted.make(draft.value) }
    case "variable":
      return { kind, value: draft.value }
    case "integration":
      return integrationConfigInput(draft)
  }
}
