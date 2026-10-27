import { InvalidInput } from "@pc/domain"
import type { JsonObject } from "../json"

/**
 * pieces-common's generic "Custom API Call" action (`createCustomApiCallAction`) attaches the connection's
 * credential to whatever URL it is given: a relative path is joined to the provider's API base URL, but an
 * absolute URL is used as is. Smartplane only accepts the relative form, so an agent can reach any endpoint of
 * the connected provider and nothing else: the credential never leaves the provider's host.
 */
export const CustomApiCallAction = "custom_api_call"

const PathDescription =
  "Path of the endpoint, relative to the provider's API base URL (for example `/repos/acme/widgets/issues`). Absolute URLs are refused: the connection's credential is only ever sent to the provider."

/** The `url` input as the piece reads it (`propsValue.url.url`), typed so agents can fill it in. */
export const customApiCallUrlSchema: JsonObject = {
  type: "object",
  title: "URL",
  properties: { url: { type: "string", description: PathDescription } },
  required: ["url"],
  additionalProperties: false
}

/** A `scheme:` prefix (`https:`, `javascript:`, ...) or a scheme-relative `//host`, after any whitespace. */
const absolute = /^\s*(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i

const urlOf = (input: JsonObject): unknown => {
  const url = input.url
  return typeof url === "object" && url !== null && !Array.isArray(url) ? Reflect.get(url, "url") : url
}

/** Why a `custom_api_call` input is refused, or `null`. Other actions are never refused here. */
export const customApiCallInputError = (actionName: string, input: JsonObject): InvalidInput | null => {
  if (actionName !== CustomApiCallAction) return null
  const url = urlOf(input)
  if (typeof url !== "string" || url.trim() === "") return new InvalidInput({ message: "url.url must be a path relative to the provider's API", field: "url.url" })
  if (absolute.test(url)) {
    return new InvalidInput({ message: "url.url must be a relative path; absolute URLs are not allowed, the request always goes to the connected provider", field: "url.url" })
  }
  return null
}
