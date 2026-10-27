import { ArrowUp, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FullRow } from "./full-row"

interface NewerEventsRowProps {
  /** The page came back empty: everything up to its cursor is already on screen. */
  readonly caughtUp: boolean
  readonly checking: boolean
  readonly onCheck: () => void
}

/** Sits above the newest loaded page; new events are stacked on top instead of reloading the log. */
export function NewerEventsRow({ caughtUp, checking, onCheck }: NewerEventsRowProps) {
  return (
    <FullRow>
      <div className="flex items-center justify-center gap-3">
        {caughtUp && <span className="text-xs text-muted-foreground">No newer events yet.</span>}
        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={checking} onClick={onCheck}>
          {caughtUp ? <RotateCw /> : <ArrowUp />}
          {caughtUp ? "Check again" : "Check for newer events"}
        </Button>
      </div>
    </FullRow>
  )
}
