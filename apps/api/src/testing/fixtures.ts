import {
  AccessTokenId,
  type AuditEvent,
  AuditEventId,
  MembershipId,
  OrgId,
  type Principal,
  RoleSlug,
  UserId
} from "@pc/domain"
import { DateTime } from "effect"

export const orgId = OrgId.make("org_testorg01")
export const userId = UserId.make("usr_testuser01")
export const otherUserId = UserId.make("usr_testuser02")
export const now = DateTime.makeUnsafe("2026-10-15T12:00:00.000Z")

export const userPrincipal = (overrides: Partial<Extract<Principal, { _tag: "User" }>> = {}): Principal => ({
  _tag: "User",
  orgId,
  userId,
  membershipId: MembershipId.make("mem_testmem01"),
  email: "ada@example.com",
  role: RoleSlug.make("member"),
  permissions: ["resources:read"],
  teamIds: [],
  projectId: null,
  tokenId: null,
  ...overrides
})

export const serviceAccountPrincipal = (tokenId = AccessTokenId.make("tok_testtok01")): Principal => ({
  _tag: "ServiceAccount",
  orgId,
  tokenId,
  name: "CI bot",
  role: RoleSlug.make("member"),
  permissions: ["resources:read"],
  teamIds: [],
  projectId: null
})

export const auditEvent = (n: number, overrides: Partial<AuditEvent> = {}): AuditEvent => ({
  id: AuditEventId.make(`evt_testevent${String(n).padStart(4, "0")}`),
  orgId,
  type: "grant.created",
  actor: { type: "user", id: userId },
  target: { type: "grant", id: `grt_test${n}` },
  data: { n, nested: { b: 2, a: 1 } },
  ip: null,
  userAgent: null,
  requestId: null,
  occurredAt: DateTime.add(now, { seconds: n }),
  ...overrides
})
