import { EnvName, envNameFromName, type Resource } from "@pc/domain"
import { Schema } from "effect"
import { describeError } from "@/lib/api/describe-error"
import type { ApiError } from "@/lib/api/errors"

const isEnvName = Schema.is(EnvName)

/** The env name set on the resource, if any; otherwise it is derived from the name. */
export const explicitEnvName = (resource: Resource): string | undefined =>
  resource.config.kind === "secret" || resource.config.kind === "variable" ? resource.config.envName : undefined

/** People type `stripe-key`; env names are `STRIPE_KEY`. Only case and separators are fixed, nothing guessed. */
export const normalizeEnvName = (raw: string): string => raw.toUpperCase().replace(/[\s-]+/g, "_")

/** Empty is allowed: it returns to the name derived from the resource's name. */
export const envNameProblem = (value: string): string | undefined =>
  value === "" || isEnvName(value) ? undefined : "Use capital letters, digits and underscores, not starting with a digit (like STRIPE_KEY)."

/** `null` keeps the name derived, so renaming the resource later still renames its variable. */
export const envNamePayload = (resource: Resource, value: string): string | null =>
  value === "" || value === envNameFromName(resource.name) ? null : value

/** The API names neither the clashing resource (the caller may not see it) nor the fix; this copy does both. */
export const deliveryProblem = (error: ApiError, envName: string | undefined): string => {
  switch (error._tag) {
    case "Conflict":
      return `${envName ?? "This name"} is already used by another deliverable secret or variable in the same scope. Choose a different env name.`
    case "InvalidInput":
      return error.field === "envName" ? "This name gives no usable env name. Set one, like STRIPE_KEY." : error.message
    case "Forbidden":
      return "Changing delivery needs the resources:manage permission or an admin grant on it."
    default:
      return describeError(error).description
  }
}
