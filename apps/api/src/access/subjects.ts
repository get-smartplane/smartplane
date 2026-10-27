import type { GrantSubject, Principal, SubjectType } from "@pc/domain"

export interface SubjectKey {
  readonly type: SubjectType
  readonly id: string
}

export const subjectKey = (subject: GrantSubject): SubjectKey =>
  subject.type === "role" ? { type: "role", id: subject.role } : { type: subject.type, id: subject.id }

/**
 * Grant subjects that apply to a principal. Personal tokens act as their creator (user, role, teams);
 * service-account tokens are their own and only subject, so they never inherit role or team grants.
 */
export const subjectsOf = (principal: Principal): ReadonlyArray<SubjectKey> =>
  principal._tag === "ServiceAccount"
    ? [{ type: "service_account", id: principal.tokenId }]
    : [
      { type: "user", id: principal.userId },
      { type: "role", id: principal.role },
      ...principal.teamIds.map((id): SubjectKey => ({ type: "team", id }))
    ]
