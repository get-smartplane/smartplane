import type { Grant, GrantSubject, LookupRef } from "@pc/domain"
import type { Names } from "../../api/names"
import { formatList, formatTime } from "../../app/format"
import { tableOr } from "../../app/table"

const subjectRef = (subject: GrantSubject): LookupRef | undefined => {
  switch (subject.type) {
    case "user":
      return { kind: "user", id: subject.id }
    case "team":
      return { kind: "team", id: subject.id }
    case "service_account":
      return { kind: "token", id: subject.id }
    case "role":
      return undefined
  }
}

/** Everything a grants table needs names for, for one batched lookup. */
export const grantRefs = (grants: ReadonlyArray<Grant>): ReadonlyArray<LookupRef> =>
  grants.flatMap((grant) => {
    const subject = subjectRef(grant.subject)
    return [{ kind: "resource" as const, id: grant.resourceId }, ...(subject === undefined ? [] : [subject])]
  })

/** `team:platform`, `user:ana@acme.com`: the same spelling `grants add --to` accepts. */
export const subjectLabel = (subject: GrantSubject, names: Names): string => {
  switch (subject.type) {
    case "role":
      return `role:${subject.role}`
    case "user":
      return `user:${names.of("user", subject.id)}`
    case "team":
      return `team:${names.of("team", subject.id)}`
    case "service_account":
      return `token:${names.of("token", subject.id)}`
  }
}

export const grantTable = (grants: ReadonlyArray<Grant>, names: Names) =>
  tableOr(
    "No grants.",
    ["id", "subject", "resource", "level", "tools", "expires"],
    grants.map((g) => [
      g.id,
      subjectLabel(g.subject, names),
      names.of("resource", g.resourceId),
      g.action,
      formatList(g.conditions.tools),
      g.expiresAt === null ? "never" : formatTime(g.expiresAt)
    ])
  )
