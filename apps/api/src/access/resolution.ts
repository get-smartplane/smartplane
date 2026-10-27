import {
  type Action,
  actionImplies,
  type DenyReason,
  type Grant,
  type Principal,
  type Resource,
  type ResourceId
} from "@pc/domain"
import { DateTime } from "effect"
import { type GrantTerms, termsDenials } from "./call-policy"
import { subjectKey, subjectsOf } from "./subjects"

/** What a principal may do with one resource, across every grant that applies to it. */
export interface EffectiveGrant {
  readonly resource: Resource
  /** The highest granted action; it implies every lower one. */
  readonly action: Action
  /** Each applying grant's action and conditions (tool and argument allow-lists), evaluated per grant. */
  readonly terms: ReadonlyArray<GrantTerms>
}

export type EffectiveAccess = ReadonlyMap<ResourceId, EffectiveGrant>

const higher = (a: Action, b: Action): Action => (actionImplies(a, b) ? a : b)

/**
 * Grants are additive (there are no deny grants; denying is what guards are for). A grant counts when it
 * names one of the principal's subjects, is neither revoked nor expired, and targets a live resource that
 * is visible from the principal's project scope.
 */
export const resolveAccess = (
  principal: Principal,
  grants: ReadonlyArray<Grant>,
  resources: ReadonlyArray<Resource>,
  now: DateTime.Utc
): EffectiveAccess => {
  const subjects = new Set(subjectsOf(principal).map(({ type, id }) => `${type}:${id}`))
  const byId = new Map(resources.map((resource) => [resource.id, resource]))
  const access = new Map<ResourceId, EffectiveGrant>()

  for (const grant of grants) {
    const key = subjectKey(grant.subject)
    const resource = byId.get(grant.resourceId)
    if (!subjects.has(`${key.type}:${key.id}`) || grant.orgId !== principal.orgId || resource === undefined) continue
    if (grant.revokedAt !== null) continue
    if (grant.expiresAt !== null && !DateTime.isGreaterThan(grant.expiresAt, now)) continue
    if (principal.projectId !== null && resource.projectId !== null && resource.projectId !== principal.projectId) continue
    const current = access.get(resource.id)
    access.set(resource.id, {
      resource,
      action: current ? higher(current.action, grant.action) : grant.action,
      terms: [...(current?.terms ?? []), { action: grant.action, conditions: grant.conditions }]
    })
  }
  return access
}

export const allows = (grant: EffectiveGrant | undefined, action: Action): boolean =>
  grant !== undefined && actionImplies(grant.action, action)

/** Why a call needing `required` is refused under one resource's grants, or `[]`. See `termsDenials`. */
export const callDenials = (
  grant: EffectiveGrant | undefined,
  resourceId: ResourceId,
  tool: string,
  required: Action,
  args?: unknown
): ReadonlyArray<DenyReason> => termsDenials(grant?.terms ?? [], resourceId, tool, required, args)

/**
 * Why calling `tool` on MCP server `serverId` is refused, or `[]` when it is allowed. A `use` grant on the
 * server covers its allow-listed tools; a `use` grant on a single `tool` resource covers exactly that tool.
 * Pass `args` to also check argument constraints.
 */
export const toolDenials = (access: EffectiveAccess, serverId: ResourceId, tool: string, args?: unknown): ReadonlyArray<DenyReason> => {
  const viaToolResources = Array.from(access.values()).flatMap(({ resource, terms }) =>
    resource.config.kind === "tool" && resource.config.serverId === serverId && resource.config.toolName === tool ? terms : []
  )
  const server = access.get(serverId)
  if (server === undefined && viaToolResources.length === 0) return [{ _tag: "NoGrant", resourceId: serverId }]
  return termsDenials([...(server?.terms ?? []), ...viaToolResources], serverId, tool, "use", args)
}
