import { Me, Org, Principal } from "@pc/domain"
import { Schema } from "effect"
import { details } from "../../app/table"

/** `whoami --json` and `login --json`: who the token acts as, and where that token came from. */
export const Identity = Schema.Struct({
  profile: Schema.String,
  apiUrl: Schema.String,
  source: Schema.Literals(["env", "profile"]),
  principal: Principal,
  org: Org
})
export type Identity = typeof Identity.Type

export const identityOf = (me: Me, context: Pick<Identity, "profile" | "apiUrl" | "source">): Identity => ({
  ...context,
  principal: me.principal,
  org: me.org
})

/** `alice@acme.com` for a user, `deploy-bot (service account)` for a service token. */
export const principalLabel = (principal: Principal): string =>
  principal._tag === "User" ? principal.email : `${principal.name} (service account)`

export const describeIdentity = (identity: Identity): string =>
  details([
    ["as", principalLabel(identity.principal)],
    ["org", `${identity.org.name} (${identity.org.slug})`],
    ["role", identity.principal.role],
    ["project", identity.principal.projectId ?? "all projects"],
    ["token", identity.principal.tokenId ?? "-"],
    ["source", identity.source === "env" ? "SMARTPLANE_TOKEN" : `profile "${identity.profile}"`],
    ["api", identity.apiUrl],
    ["permissions", identity.principal.permissions.join(", ")]
  ])
