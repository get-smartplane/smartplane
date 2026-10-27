import type { Member } from "@pc/domain"
import { useState } from "react"
import { matchesQuery, SearchInput } from "@/components/form/search-input"
import { SegmentedFilter } from "@/components/layout/segmented-filter"
import { Toolbar } from "@/components/layout/toolbar"
import { filterMembers, memberSegments, type MemberView } from "./member-filter"
import { MembersTable } from "./members-table"

/** The roster with its summary as a filter, and a search for long lists. */
export function MembersList({ members }: { readonly members: ReadonlyArray<Member> }) {
  const [view, setView] = useState<MemberView>("current")
  const [query, setQuery] = useState("")
  const shown = filterMembers(members, view).filter((member) => matchesQuery(query, [member.name, member.email, member.role]))
  return (
    <div className="flex flex-col gap-3">
      <Toolbar end={<SearchInput label="Search people" value={query} onChange={setQuery} className="sm:w-60" />}>
        <SegmentedFilter label="Show members" segments={memberSegments(members)} value={view} onChange={setView} />
      </Toolbar>
      {shown.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nobody matches this view.</p>
      ) : (
        <MembersTable members={shown} />
      )}
    </div>
  )
}
