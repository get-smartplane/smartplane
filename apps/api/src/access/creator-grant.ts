import type { Grant, Resource, ResourceKind, UserId } from "@pc/domain"
import { DateTime, Effect } from "effect"
import { Ids } from "../platform/ids"

/**
 * Secrets are used only through the resource they are attached to, never granted for themselves: a grant on
 * one would only widen who could reach it. Every other kind is usable, variables included (`variables_get`).
 */
export const grantsToCreator = (kind: ResourceKind): boolean => kind !== "secret"

/** Why a creator grant exists; recorded on its `grant.created` event so access reviews can explain it. */
export type CreatorGrantReason = "creator"

/**
 * A plain, revocable direct grant: `admin`, no conditions, no expiry, made by the creator. Project scope needs
 * no copy: a grant reaches a project-scoped resource only from that project, because resolution checks the
 * resource's own `projectId` against the caller's.
 */
export const creatorGrant = (resource: Resource, creator: UserId) =>
  Effect.gen(function*() {
    const grant: Grant = {
      id: yield* Ids.grant,
      orgId: resource.orgId,
      subject: { type: "user", id: creator },
      resourceId: resource.id,
      action: "admin",
      conditions: {},
      expiresAt: null,
      createdBy: creator,
      createdAt: yield* DateTime.now,
      revokedAt: null
    }
    return grant
  })

/** The `grant.created` audit data, the same shape for every way a grant comes to exist. */
export const grantCreatedData = (grant: Grant, extra: Readonly<Record<string, unknown>> = {}) => ({
  subject: grant.subject,
  resourceId: grant.resourceId,
  action: grant.action,
  conditions: grant.conditions,
  expiresAt: grant.expiresAt === null ? null : DateTime.formatIso(grant.expiresAt),
  ...extra
})
