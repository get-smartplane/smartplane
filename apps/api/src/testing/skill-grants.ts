import { type Action, type Grant, GrantId, type Resource } from "@pc/domain"
import { now, orgId, userId } from "./fixtures"

let counter = 0

/** A live grant of `action` on `resource` to the fixture user. */
export const grantOn = (resource: Resource, action: Action, overrides: Partial<Grant> = {}): Grant => ({
  id: GrantId.make(`grt_skillgrant${counter++}`),
  orgId,
  subject: { type: "user", id: userId },
  resourceId: resource.id,
  action,
  conditions: {},
  expiresAt: null,
  createdBy: userId,
  createdAt: now,
  revokedAt: null,
  ...overrides
})
