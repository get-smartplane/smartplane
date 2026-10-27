import { Schema } from "effect"

/** What the marketing site passes along when someone starts signing up there. */
export const SignupSearch = Schema.Struct({
  organization: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))),
  plan: Schema.optionalKey(Schema.Literals(["free", "team", "enterprise"]))
})
export type SignupSearch = typeof SignupSearch.Type

const KEY = "pc.signup.organization"

// sessionStorage can be unavailable (private mode, blocked storage); a missing prefill is harmless.
export const rememberOrganization = (name: string | undefined): void => {
  try {
    if (name) sessionStorage.setItem(KEY, name)
  } catch {}
}

export const takeOrganization = (): string => {
  try {
    const name = sessionStorage.getItem(KEY) ?? ""
    sessionStorage.removeItem(KEY)
    return name
  } catch {
    return ""
  }
}
