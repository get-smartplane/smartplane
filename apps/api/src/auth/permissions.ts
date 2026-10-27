import { Forbidden, hasPermission, type OrgPermission, type Principal, type ProjectId } from "@pc/domain"
import { Effect } from "effect"

export const requirePermission = (principal: Principal, permission: OrgPermission): Effect.Effect<void, Forbidden> =>
  hasPermission(principal, permission)
    ? Effect.void
    : Effect.fail(new Forbidden({ message: `requires the ${permission} permission`, permission }))

/** Dashboard actions that only a person can take (service-account tokens are for agents). */
export const requireUser = (principal: Principal): Effect.Effect<Extract<Principal, { _tag: "User" }>, Forbidden> =>
  principal._tag === "User"
    ? Effect.succeed(principal)
    : Effect.fail(new Forbidden({ message: "service accounts cannot perform this action" }))

/**
 * Credential management needs a signed-in dashboard session: a leaked bearer token must not be able to
 * mint a fresh, wider or longer-lived credential for itself.
 */
export const requireSession = (principal: Principal): Effect.Effect<Extract<Principal, { _tag: "User" }>, Forbidden> =>
  principal._tag === "User" && principal.tokenId === null
    ? Effect.succeed(principal)
    : Effect.fail(new Forbidden({ message: "sign in to the dashboard to create or renew tokens; a token cannot mint another" }))

/** A principal scoped to one project can only hand out credentials for that same project. */
export const requireWithinProject = (principal: Principal, projectId: ProjectId | null): Effect.Effect<void, Forbidden> =>
  principal.projectId === null || principal.projectId === projectId
    ? Effect.void
    : Effect.fail(new Forbidden({ message: "a project-scoped caller cannot create a token outside its project" }))
