import { actionImplies, type Action, type Grant, type GrantSubject } from "@pc/domain"

export const subjectKey = (subject: GrantSubject): string =>
  subject.type === "role" ? `role:${subject.role}` : `${subject.type}:${subject.id}`

/** The strongest action among grants; the others are implied by it. */
export const strongestAction = (grants: ReadonlyArray<Grant>): Action | undefined =>
  grants.reduce<Action | undefined>(
    (best, grant) => (best === undefined || actionImplies(grant.action, best) ? grant.action : best),
    undefined
  )
