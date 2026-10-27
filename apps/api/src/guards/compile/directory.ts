import type { GuardApprover, RoleSlug, TeamId, UserId } from "@pc/domain"

/** The org's roles, teams and members, so approver references in a rule can be resolved to ids. */
export interface OrgDirectory {
  readonly roles: ReadonlyArray<RoleSlug>
  readonly teams: ReadonlyArray<{ readonly id: TeamId; readonly name: string }>
  readonly members: ReadonlyArray<{ readonly userId: UserId; readonly email: string; readonly name: string | null }>
}

export const emptyDirectory: OrgDirectory = { roles: [], teams: [], members: [] }

const selfReferences = new Set(["my", "me", "i", "mine", "our", "us", "author", "the author", "rule author", "the rule author"])

const normalise = (reference: string) =>
  reference.toLowerCase().trim()
    .replace(/[’']s$|s[’']$/, "")
    .replace(/^(?:the|an?|our|some|any)\s+/, "")
    .replace(/\s+(?:team|group|department|role)$/, "")
    .trim()

const singular = (word: string) => (word.endsWith("s") && word.length > 3 ? word.slice(0, -1) : word)

/**
 * Resolves "my", "an admin's", "the security team", "dana@acme.com" or "Dana" to an approver, trying the
 * author, then roles, teams and members. Returns the reference itself when nothing matches, for the reviewer.
 */
export const resolveApprover = (reference: string, directory: OrgDirectory): GuardApprover | string => {
  const raw = reference.toLowerCase().trim().replace(/[’']s$/, "")
  if (selfReferences.has(raw) || raw === "") return { _tag: "Author" }
  const key = normalise(reference)
  if (selfReferences.has(key)) return { _tag: "Author" }
  const role = directory.roles.find((slug) => slug === key || slug === singular(key))
  if (role !== undefined) return { _tag: "Role", role }
  const team = directory.teams.find((t) => {
    const name = t.name.toLowerCase()
    return name === key || singular(name) === singular(key) || name === `${key} team`
  })
  if (team !== undefined) return { _tag: "Team", teamId: team.id }
  const member = directory.members.find((m) => {
    const name = m.name?.toLowerCase() ?? ""
    return m.email.toLowerCase() === key || m.email.toLowerCase().split("@")[0] === key || name === key || name.split(" ")[0] === key
  })
  if (member !== undefined) return { _tag: "User", userId: member.userId }
  return reference.trim()
}

/**
 * Role and team names for the compiler prompt. Never members: their names and emails are personal data the
 * model does not need, since it returns approver references as written and `resolveApprover` finds the
 * person afterwards, deterministically and locally.
 */
export const describeDirectory = (directory: OrgDirectory): string =>
  [
    `Roles: ${directory.roles.join(", ") || "owner, admin, auditor, member, viewer"}`,
    `Teams: ${directory.teams.map((t) => t.name).join(", ") || "none"}`
  ].join("\n")
