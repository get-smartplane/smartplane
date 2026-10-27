import type { GuardActorFilter, GuardReferences, GuardSuggestion } from "@pc/domain"
import type { OrgDirectory } from "../compile/directory"

/** "billing@acme.com", and the bare "billing@" people write for a shared inbox. */
const accountPattern = /[a-z0-9][a-z0-9._%+-]*@(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})?/gi

const words = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9@.'’-]+/g, " ")} `

/**
 * Which identities a rule needs the classifier to see, decided locally from its wording and the org's
 * directory (nothing here reaches a model). It names people when it mentions a member by email or name
 * (first names of three letters or more), when its suggested approvers or actor filter name a person, or when
 * a name in it matched nobody (it may be a person the directory spells differently). False positives only
 * send the email as before; a miss would hide who is acting from a rule about them, so matching is generous.
 */
export const readReferences = (
  rule: string,
  directory: OrgDirectory,
  extra: { readonly suggestion?: GuardSuggestion | undefined; readonly actors?: GuardActorFilter | undefined } = {}
): GuardReferences => {
  const accounts = [...new Set([...rule.matchAll(accountPattern)].map((match) => match[0].toLowerCase().replace(/\.$/, "")))].slice(0, 20)
  const text = words(rule)
  const memberNamed = directory.members.some((member) => {
    const email = member.email.toLowerCase()
    if (accounts.includes(email) || accounts.includes(`${email.split("@")[0]}@`)) return true
    const name = member.name?.toLowerCase().trim() ?? ""
    const first = name.split(/\s+/)[0] ?? ""
    return (name !== "" && text.includes(` ${name} `)) || (first.length >= 3 && [` ${first} `, ` ${first}'s `, ` ${first}’s `].some((form) => text.includes(form)))
  })
  const people = memberNamed ||
    (extra.suggestion?.approvers.some((approver) => approver._tag === "User") ?? false) ||
    (extra.suggestion?.unresolved.length ?? 0) > 0 ||
    (extra.actors?.refs.some((ref) => ref._tag === "User") ?? false)
  return { people, accounts }
}

/** Whether a connected account is one a rule names: the same email, or the same local part for "billing@". */
export const namesAccount = (references: ReadonlyArray<string>, email: string | undefined, username: string | undefined): boolean => {
  const identities = [email, username].flatMap((value) => (value === undefined ? [] : [value.toLowerCase()]))
  return references.some((reference) =>
    identities.some((identity) => identity === reference || (reference.endsWith("@") && identity.startsWith(reference)))
  )
}
