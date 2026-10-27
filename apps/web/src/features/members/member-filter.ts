import type { Member } from "@pc/domain"
import type { Segment } from "@/components/layout/segmented-filter"

export type MemberView = "current" | "invited" | "offboarded" | "all"

const inView: { readonly [V in MemberView]: (member: Member) => boolean } = {
  current: (member) => member.status !== "deprovisioned",
  invited: (member) => member.status === "invited",
  offboarded: (member) => member.status === "deprovisioned",
  all: () => true
}

export const filterMembers = (members: ReadonlyArray<Member>, view: MemberView) => members.filter(inView[view])

/** Offboarded people stay on record for compliance but are out of the default view. */
export const memberSegments = (members: ReadonlyArray<Member>): ReadonlyArray<Segment<MemberView>> => [
  { value: "current", label: "Current", count: filterMembers(members, "current").length },
  { value: "invited", label: "Invited", count: filterMembers(members, "invited").length },
  { value: "offboarded", label: "Offboarded", count: filterMembers(members, "offboarded").length },
  { value: "all", label: "All", count: members.length }
]
