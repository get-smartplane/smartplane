import {
  type AccessReviewScope,
  type Grant,
  type MembershipId,
  ReviewedAccess,
  type ReviewedMachineToken,
  type RoleSlug,
  type UserId
} from "@pc/domain"

export interface ActiveMembership {
  readonly membershipId: MembershipId
  readonly userId: UserId | null
  readonly email: string
  readonly role: RoleSlug
}

/** Who currently holds what, read once when a campaign is created. */
export interface AccessState {
  readonly memberships: ReadonlyArray<ActiveMembership>
  /** Active, unexpired grants already narrowed to the campaign's scope. */
  readonly grants: ReadonlyArray<Grant>
  readonly teamMembers: ReadonlyMap<string, ReadonlyArray<UserId>>
  /** Service-account token id to the user who created it. */
  readonly tokenCreators: ReadonlyMap<string, UserId>
  /** Live machine tokens in scope; they outlive their creator's membership, so reviewers must see them. */
  readonly machineTokens: ReadonlyArray<ReviewedMachineToken>
}

export interface SnapshotItem {
  readonly access: ReviewedAccess
  readonly beneficiaries: ReadonlyArray<UserId>
}

const userIds = (memberships: ReadonlyArray<ActiveMembership>) =>
  memberships.flatMap((membership) => (membership.userId === null ? [] : [membership.userId]))

/**
 * Everyone who benefits from a grant: its user, a team's members, a role's holders, or a service account's
 * creator. Separation of duties keys on this list, so team and role grants cannot be self-reviewed either.
 */
const beneficiariesOf = (grant: Grant, state: AccessState): ReadonlyArray<UserId> => {
  switch (grant.subject.type) {
    case "user":
      return [grant.subject.id]
    case "team":
      return state.teamMembers.get(grant.subject.id) ?? []
    case "role": {
      const role = grant.subject.role
      return userIds(state.memberships.filter((membership) => membership.role === role))
    }
    case "service_account": {
      const creator = state.tokenCreators.get(grant.subject.id)
      return creator === undefined ? [] : [creator]
    }
  }
}

/** Items for a campaign: memberships only for an org-wide review (projects do not have members), then grants. */
export const snapshotItems = (scope: AccessReviewScope, state: AccessState): ReadonlyArray<SnapshotItem> => [
  ...(scope.type === "org" ? state.memberships : []).map((membership): SnapshotItem => ({
    access: ReviewedAccess.cases.Membership.make({ ...membership }),
    beneficiaries: membership.userId === null ? [] : [membership.userId]
  })),
  ...state.grants.map((grant): SnapshotItem => ({
    access: ReviewedAccess.cases.Grant.make({
      grantId: grant.id,
      subject: grant.subject,
      resourceId: grant.resourceId,
      action: grant.action,
      conditions: grant.conditions,
      expiresAt: grant.expiresAt
    }),
    beneficiaries: [...new Set(beneficiariesOf(grant, state))]
  }))
]
