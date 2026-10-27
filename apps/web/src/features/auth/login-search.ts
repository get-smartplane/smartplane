import { Schema } from "effect"

export const LoginSearch = Schema.Struct({
  reason: Schema.optionalKey(Schema.Literals(["deprovisioned"])),
  /** Set by the API's `/auth/callback` when sign-in could not be completed. */
  error: Schema.optionalKey(Schema.Literals(["missing_code", "sign_in_failed"]))
})
export type LoginSearch = typeof LoginSearch.Type
