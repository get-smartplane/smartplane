import type { AccessReview, AccessReviewItem, ReviewedAccess, ReviewedMachineToken } from "@pc/domain"
import { DateTime } from "effect"

const header = [
  "review_id", "review_name", "closed_at", "item_id", "kind", "access_id", "subject", "email", "role",
  "resource_id", "action", "beneficiaries", "decision", "decided_by", "decided_at", "applied_at", "comment"
]

/**
 * RFC 4180 quoting, plus a leading apostrophe on cells a spreadsheet would read as a formula
 * (CSV injection: comments and names are user input).
 */
const cell = (value: string | null): string => {
  const text = value ?? ""
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll("\"", "\"\"")}"` : safe
}

const iso = (value: DateTime.Utc | null) => (value === null ? null : DateTime.formatIso(value))

const accessColumns = (access: ReviewedAccess): ReadonlyArray<string | null> => {
  if (access._tag === "Membership") {
    return ["membership", access.membershipId, access.userId === null ? null : `user:${access.userId}`, access.email, access.role, null, null]
  }
  const subject = access.subject.type === "role" ? `role:${access.subject.role}` : `${access.subject.type}:${access.subject.id}`
  return ["grant", access.grantId, subject, null, null, access.resourceId, access.action]
}

/**
 * Machine tokens are listed, not attested item by item: `subject` is their creator, `resource_id` the
 * space-separated allow-list, and the decision columns stay empty (revocation is audited separately).
 */
const machineTokenRow = (review: AccessReview, token: ReviewedMachineToken): ReadonlyArray<string | null> => [
  review.id, review.name, iso(review.closedAt), null,
  "machine_token", token.machineTokenId, `created_by:${token.createdBy}`, null, null, token.allow.join(" "), "deliver",
  token.createdBy, null, null, null, null, `${token.name}; expires ${DateTime.formatIso(token.expiresAt)}`
]

/** Evidence export of an access review: one row per item, in snapshot order, then the machine tokens. */
export const reviewCsv = (review: AccessReview, items: ReadonlyArray<AccessReviewItem>, machineTokens: ReadonlyArray<ReviewedMachineToken> = []): string =>
  [header, ...items.map((item) => [
    review.id,
    review.name,
    iso(review.closedAt),
    item.id,
    ...accessColumns(item.access),
    item.beneficiaries.join(" "),
    item.decision,
    item.decidedBy,
    iso(item.decidedAt),
    iso(item.appliedAt),
    item.comment
  ]), ...machineTokens.map((token) => machineTokenRow(review, token))].map((row) => `${row.map(cell).join(",")}\r\n`).join("")
