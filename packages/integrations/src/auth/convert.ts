import type { AuthField, IntegrationAuthType, PieceAuth } from "@pc/domain"
import { Schema } from "effect"
import { isPrimitive } from "../json"
import { PieceProp, StaticOptions } from "../piece-shape"

const Text = Schema.optional(Schema.NullOr(Schema.String))
const base = { displayName: Schema.String, description: Text }
const Label = Schema.Struct({ displayName: Schema.String, description: Text })

const ApSecretText = Schema.Struct({ type: Schema.Literal("SECRET_TEXT"), ...base })
const ApBasic = Schema.Struct({ type: Schema.Literal("BASIC_AUTH"), ...base, username: Label, password: Label })
const ApCustom = Schema.Struct({ type: Schema.Literal("CUSTOM_AUTH"), ...base, props: Schema.Record(Schema.String, PieceProp) })
const ApOAuth2 = Schema.Struct({
  type: Schema.Literal("OAUTH2"),
  ...base,
  authUrl: Schema.String,
  tokenUrl: Schema.String,
  scope: Schema.Array(Schema.String),
  pkce: Schema.optional(Schema.Boolean),
  pkceMethod: Schema.optional(Schema.Literals(["plain", "S256"])),
  authorizationMethod: Schema.optional(Schema.Literals(["HEADER", "BODY"])),
  grantType: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.Literals(["none", "consent", "login", "omit"])),
  extra: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  props: Schema.optional(Schema.Record(Schema.String, PieceProp))
})
const ApAuth = Schema.Union([ApSecretText, ApBasic, ApCustom, ApOAuth2])
const isApAuth = Schema.is(ApAuth)
const isStaticOptions = Schema.is(StaticOptions)

const described = (auth: { readonly displayName: string; readonly description?: string | null | undefined }) => ({
  displayName: auth.displayName,
  ...(auth.description ? { description: auth.description } : {})
})

const fieldKinds: Readonly<Record<string, AuthField["kind"]>> = {
  LONG_TEXT: "long_text",
  SECRET_TEXT: "secret",
  NUMBER: "number",
  CHECKBOX: "checkbox",
  STATIC_DROPDOWN: "select"
}

const fieldsOf = (props: Readonly<Record<string, PieceProp>> | undefined): Array<AuthField> =>
  Object.entries(props ?? {}).map(([name, prop]) => {
    const options = isStaticOptions(prop.options)
      ? prop.options.options.flatMap((option) => (isPrimitive(option.value) ? [{ label: option.label, value: String(option.value) }] : []))
      : undefined
    return {
      name,
      displayName: prop.displayName ?? name,
      ...(prop.description ? { description: prop.description } : {}),
      required: prop.required === true,
      kind: fieldKinds[prop.type] ?? "text",
      ...(isPrimitive(prop.defaultValue) && prop.defaultValue !== "" ? { defaultValue: String(prop.defaultValue) } : {}),
      ...(options === undefined ? {} : { options })
    }
  })

/** Client-credentials-only OAuth2 has no user to authorize; Smartplane runs the authorization-code flow. */
const isAuthorizationCode = (grantType: string | undefined) => grantType === undefined || grantType !== "client_credentials"

const convertOne = (auth: typeof ApAuth.Type): PieceAuth | undefined => {
  switch (auth.type) {
    case "SECRET_TEXT":
      return { type: "secret_text", ...described(auth) }
    case "BASIC_AUTH":
      return { type: "basic", ...described(auth), username: described(auth.username), password: described(auth.password) }
    case "CUSTOM_AUTH":
      return { type: "custom", ...described(auth), fields: fieldsOf(auth.props) }
    case "OAUTH2":
      if (!isAuthorizationCode(auth.grantType)) return undefined
      return {
        type: "oauth2",
        ...described(auth),
        authUrl: auth.authUrl,
        tokenUrl: auth.tokenUrl,
        scopes: auth.scope,
        // Activepieces defaults the PKCE method to `plain` when a piece only says `pkce: true`.
        pkce: auth.pkce === true ? auth.pkceMethod ?? "plain" : null,
        clientAuthentication: auth.authorizationMethod === "HEADER" ? "header" : "body",
        extraParams: auth.extra ?? {},
        prompt: auth.prompt ?? null,
        fields: fieldsOf(auth.props)
      }
  }
}

export interface ConvertedAuth {
  readonly auth: ReadonlyArray<PieceAuth>
  readonly authTypes: ReadonlyArray<IntegrationAuthType>
  /** Connection methods the piece offers that Smartplane cannot provide (e.g. OIDC). */
  readonly skipped: ReadonlyArray<string>
}

/** A piece's auth: absent, one property, or several alternatives. */
export const convertAuth = (auth: unknown): ConvertedAuth => {
  const declared: ReadonlyArray<unknown> = auth === undefined || auth === null ? [] : Array.isArray(auth) ? auth : [auth]
  const converted = declared.map((entry) => (isApAuth(entry) ? convertOne(entry) : undefined))
  const supported = converted.filter((entry) => entry !== undefined)
  const skipped = declared.flatMap((entry, index) =>
    converted[index] === undefined ? [String(typeof entry === "object" && entry !== null && "type" in entry ? entry.type : "unknown")] : []
  )
  return { auth: supported, authTypes: declared.length === 0 ? ["none"] : supported.map((entry) => entry.type), skipped }
}
