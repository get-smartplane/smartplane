import type { IntegrationAction } from "@pc/domain"
import { useState } from "react"
import { matchesQuery, SearchInput } from "@/components/form/search-input"
import { Section } from "@/components/layout/section"
import { Field, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { actionGroups, groupOf, isOffered } from "./action-groups"
import { ActionGroupList } from "./action-group-list"

interface ActionListProps {
  readonly actions: ReadonlyArray<IntegrationAction>
  /** Offer the "Show all" switch for replaced and unavailable actions (the catalog view, not a resource). */
  readonly revealHidden?: boolean
}

/** Actions split by what they need: reads and searches (use) apart from anything that changes data (write). */
export function ActionList({ actions, revealHidden = false }: ActionListProps) {
  const [query, setQuery] = useState("")
  const [showAll, setShowAll] = useState(false)
  const hidden = actions.filter((action) => !isOffered(action)).length
  const shown = actions.filter(
    (action) => (showAll || isOffered(action)) && matchesQuery(query, [action.name, action.displayName, action.description])
  )
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput label="Search actions" value={query} onChange={setQuery} className="sm:w-72" />
        {revealHidden && hidden > 0 && (
          <Field orientation="horizontal" className="w-fit">
            <Switch id="actions-show-all" checked={showAll} onCheckedChange={setShowAll} />
            <FieldLabel htmlFor="actions-show-all" className="font-normal text-muted-foreground">
              Show all, including {hidden} replaced or unavailable
            </FieldLabel>
          </Field>
        )}
      </div>
      {actionGroups.map(({ group, title, description }) => {
        const inGroup = shown.filter((action) => groupOf(action) === group)
        if (inGroup.length === 0) return null
        return (
          <Section key={group} title={title} description={description} aside={<span className="tabular-nums">{inGroup.length}</span>}>
            <ActionGroupList actions={inGroup} searching={query.trim() !== ""} />
          </Section>
        )
      })}
      {shown.length === 0 && (
        <p className="text-sm text-muted-foreground">{query.trim() === "" ? "No action is available here." : `No action matches “${query}”.`}</p>
      )}
    </div>
  )
}
