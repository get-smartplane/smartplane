import {
  AccessReviewId,
  AccessReviewItemId,
  AccessTokenId,
  ApprovalId,
  AuditEventId,
  ConnectionId,
  GrantId,
  GuardId,
  IdPrefix,
  MachineTokenId,
  MembershipId,
  OrgId,
  ProjectId,
  ResourceId,
  SkillVersionId,
  TeamId,
  UserId
} from "@pc/domain"
import { Effect } from "effect"

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"

/** Time-prefixed so ids sort roughly by creation; 16 random base36 chars (~82 bits) keep them unguessable. */
const raw = (prefix: string): string => {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => alphabet[byte % 36]).join("")
  return `${prefix}_${Date.now().toString(36)}${random}`
}

const generator = <A>(prefix: string, make: (id: string) => A) => Effect.sync(() => make(raw(prefix)))

export const Ids = {
  org: generator(IdPrefix.OrgId, OrgId.make),
  user: generator(IdPrefix.UserId, UserId.make),
  membership: generator(IdPrefix.MembershipId, MembershipId.make),
  team: generator(IdPrefix.TeamId, TeamId.make),
  project: generator(IdPrefix.ProjectId, ProjectId.make),
  resource: generator(IdPrefix.ResourceId, ResourceId.make),
  grant: generator(IdPrefix.GrantId, GrantId.make),
  guard: generator(IdPrefix.GuardId, GuardId.make),
  approval: generator(IdPrefix.ApprovalId, ApprovalId.make),
  accessToken: generator(IdPrefix.AccessTokenId, AccessTokenId.make),
  auditEvent: generator(IdPrefix.AuditEventId, AuditEventId.make),
  accessReview: generator(IdPrefix.AccessReviewId, AccessReviewId.make),
  accessReviewItem: generator(IdPrefix.AccessReviewItemId, AccessReviewItemId.make),
  skillVersion: generator(IdPrefix.SkillVersionId, SkillVersionId.make),
  connection: generator(IdPrefix.ConnectionId, ConnectionId.make),
  machineToken: generator(IdPrefix.MachineTokenId, MachineTokenId.make)
}

/** Lower-case kebab slug that satisfies the domain `Slug` pattern; never empty. */
export const slugify = (input: string): string =>
  input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "") || "x"
