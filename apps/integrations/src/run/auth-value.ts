import type { RunAuth } from "@pc/integrations/rpc"
import { Redacted } from "effect"

/**
 * The Activepieces `AppConnectionValue` for a run's credentials: what pieces read as `context.auth`
 * (`auth.secret_text`, `auth.access_token`, `auth.props.instanceUrl`, ...). OAuth2 refresh tokens and client
 * secrets stay in apps/api; pieces get only the current access token.
 */
export const connectionValue = (auth: RunAuth): unknown => {
  switch (auth.type) {
    case "none":
      return undefined
    case "secret_text":
      return { type: "SECRET_TEXT", secret_text: Redacted.value(auth.secret) }
    case "basic":
      return { type: "BASIC_AUTH", username: auth.username, password: Redacted.value(auth.password) }
    case "custom":
      return { type: "CUSTOM_AUTH", props: Redacted.value(auth.props) }
    case "oauth2":
      return {
        type: "OAUTH2",
        access_token: Redacted.value(auth.accessToken),
        token_type: auth.tokenType,
        scope: auth.scope,
        data: Redacted.value(auth.data),
        props: auth.props
      }
  }
}

const MinSecretLength = 6

/** Strings that look like credentials: every top-level string, and nested ones under a credential-like key. */
const secretStrings = (value: unknown, key = ""): ReadonlyArray<string> => {
  if (typeof value === "string") return /token|secret|password|key/i.test(key) || key === "" ? [value] : []
  if (typeof value !== "object" || value === null) return []
  return Object.entries(value).flatMap(([name, inner]) => secretStrings(inner, name))
}

/**
 * Credential strings of a run, to scrub from anything leaving the Worker (errors, output). Basic auth also
 * travels as `base64(username:password)`, the form an echoed `Authorization` header would show.
 */
export const secretsOf = (auth: RunAuth): ReadonlyArray<string> => {
  const values = (() => {
    switch (auth.type) {
      case "none":
        return []
      case "secret_text":
        return [Redacted.value(auth.secret)]
      case "basic":
        return [Redacted.value(auth.password), btoa(`${auth.username}:${Redacted.value(auth.password)}`)]
      case "custom":
        return Object.values(Redacted.value(auth.props)).flatMap((value) => secretStrings(value))
      case "oauth2":
        return [Redacted.value(auth.accessToken), ...secretStrings(Redacted.value(auth.data))]
    }
  })()
  return [...new Set(values.filter((value) => value.length >= MinSecretLength))]
}

const safeBase64 = (text: string): string | null => {
  try {
    return btoa(text)
  } catch {
    return null
  }
}

/** The forms a credential takes in request or response text: raw, JSON-escaped, URL-encoded and base64. */
const spellings = (secret: string): ReadonlyArray<string> =>
  [...new Set([secret, JSON.stringify(secret).slice(1, -1), encodeURIComponent(secret), safeBase64(secret)])].filter(
    (form): form is string => form !== null && form.length >= MinSecretLength
  )

/** Replaces every credential string in `text`, in each of its spellings. */
export const scrubber = (secrets: ReadonlyArray<string>) => (text: string): string =>
  secrets.flatMap(spellings).reduce((current, form) => current.split(form).join("[redacted]"), text)
