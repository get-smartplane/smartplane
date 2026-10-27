import type { Action, IntegrationAction } from "@pc/domain"
import { Info } from "lucide-react"
import { ExpandableNames } from "@/components/form/expandable-names"
import { Button } from "@/components/ui/button"
import { writesBelowLevel } from "./write-level"

interface WriteLevelHintProps {
  readonly action: Action
  readonly actions: ReadonlyArray<IntegrationAction>
  /** The allow-list, or null for every action. */
  readonly chosen: ReadonlyArray<string> | null
  readonly onSwitchToWrite: () => void
  /** Takes the named actions off the allow-list. */
  readonly onRemove: (names: ReadonlyArray<string>) => void
}

/**
 * Names the chosen actions that change things but stay out of reach at this level, and offers both ways
 * out, so nobody grants something that silently does less than it says.
 */
export function WriteLevelHint({ action, actions, chosen, onSwitchToWrite, onRemove }: WriteLevelHintProps) {
  const writes = writesBelowLevel(action, actions, chosen)
  if (writes.length === 0) return null
  const names = writes.map((write) => write.name)
  // Removing only makes sense from an allow-list, and only if something would be left to grant.
  const removable = chosen !== null && chosen.some((name) => !names.includes(name))
  const one = writes.length === 1
  const subject = chosen === null ? `${writes.length} of its actions` : one ? "1 chosen action" : `${writes.length} chosen actions`
  const needs = `${subject} ${one ? "changes" : "change"} things and ${one ? "needs" : "need"} Write`
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-lg bg-warning/12 p-3 text-sm dark:bg-warning/10">
      <Info className="mt-0.5 size-4 shrink-0 text-warning-ink" />
      <div className="flex min-w-0 flex-col gap-2">
        <p>{action === "read" ? `Read runs no actions at all, and ${needs}:` : `${needs}, so Use leaves ${one ? "it" : "them"} out:`}</p>
        <ExpandableNames names={writes.map((write) => write.displayName)} />
        <div className="flex flex-wrap gap-2 pt-0.5">
          <Button type="button" size="sm" onClick={onSwitchToWrite}>
            Switch to Write
          </Button>
          {removable && (
            <Button type="button" size="sm" variant="outline" onClick={() => onRemove(names)}>
              Remove {writes.length === 1 ? "this action" : "these actions"} from the grant
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
