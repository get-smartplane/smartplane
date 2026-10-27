import { ResourceKind } from "@pc/domain"
import { Schema } from "effect"
import { OAuthReturn } from "@/features/integrations/oauth-return"

/** `integration`/`reason`: an OAuth sign-in that failed before Smartplane knew which integration it was for. */
export const ResourceSearch = Schema.Struct({ kind: Schema.optionalKey(ResourceKind), ...OAuthReturn.fields })
export type ResourceSearch = typeof ResourceSearch.Type
