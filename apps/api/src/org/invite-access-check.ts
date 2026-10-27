import { Conflict, type InviteAccess, InvalidInput, NotFound, type Principal } from "@pc/domain"
import { DateTime, Effect, Option } from "effect"
import { checkGrantConditions } from "../access/grant-conditions"
import { requirePermission } from "../auth/permissions"
import { ResourcesRepo } from "../resources/resources-repo"
import { TeamsRepo } from "./teams-repo"

const sameItems = (a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>) => {
  const left = a.map((item) => JSON.stringify(item))
  const right = new Set(b.map((item) => JSON.stringify(item)))
  return left.length === right.size && left.every((item) => right.has(item))
}

/**
 * An invitation's access must be something its author could set up directly: team changes need
 * `teams:manage`, grant changes `grants:manage`. Teams must exist and be managed here (a directory-synced
 * team mirrors the identity provider), and each grant must pass the same checks as `Grants.create`.
 * `previous` is the setup being replaced, so an unchanged part needs no permission.
 */
export const checkInviteAccess = Effect.fn("Invitations.checkAccess")(function*(
  principal: Principal,
  access: InviteAccess,
  previous: InviteAccess | undefined
) {
  const teams = yield* TeamsRepo
  const resources = yield* ResourcesRepo
  if (!sameItems(access.teamIds, previous?.teamIds ?? [])) yield* requirePermission(principal, "teams:manage")
  if (!sameItems(access.grants, previous?.grants ?? [])) yield* requirePermission(principal, "grants:manage")

  for (const id of access.teamIds) {
    const team = yield* teams.find(principal.orgId, id)
    if (Option.isNone(team)) return yield* new NotFound({ entity: "team", id })
    if (team.value.directoryGroupId !== null) {
      return yield* new Conflict({ message: `membership of ${team.value.name} is managed by directory sync` })
    }
  }

  const now = yield* DateTime.now
  for (const [index, grant] of access.grants.entries()) {
    const resource = yield* resources.find(principal.orgId, grant.resourceId)
    if (Option.isNone(resource)) return yield* new NotFound({ entity: "resource", id: grant.resourceId })
    yield* checkGrantConditions(resource.value, grant.conditions).pipe(
      Effect.mapError((error) => new InvalidInput({ message: error.message, field: `access.grants.${index}.${error.field ?? "conditions"}` }))
    )
    if (grant.expiresAt !== null && !DateTime.isGreaterThan(grant.expiresAt, now)) {
      return yield* new InvalidInput({ message: "expiresAt must be in the future", field: `access.grants.${index}.expiresAt` })
    }
  }
})
