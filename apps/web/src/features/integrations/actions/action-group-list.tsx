import type { IntegrationAction } from "@pc/domain"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ActionRow } from "./action-row"

/** Long pieces list 50+ actions per group; the first few show, the rest one click away (search shows all). */
const preview = 8

export function ActionGroupList({ actions, searching }: { readonly actions: ReadonlyArray<IntegrationAction>; readonly searching: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded || searching ? actions : actions.slice(0, preview)
  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {shown.map((action) => (
          <ActionRow key={action.name} action={action} />
        ))}
      </ul>
      {shown.length < actions.length && (
        <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => setExpanded(true)}>
          Show all {actions.length}
        </Button>
      )}
    </div>
  )
}
