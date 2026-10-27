import { type Guard, type GuardSuggestion, sameApprovers } from "@pc/domain"
import { Check, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { ApproverLabel } from "./approver-label"
import { updateGuardAtom } from "./atoms"
import { modeMeta } from "./guard-meta"

const applied = (guard: Guard, suggestion: GuardSuggestion) =>
  guard.mode === suggestion.mode && (suggestion.mode !== "require_approval" || sameApprovers(guard.approvers, suggestion.approvers))

/**
 * What the rule's wording asks for ("without my permission" → hold for the author's approval), with a
 * one-click way to adopt it. Adopting changes mode and approvers only: the rule stays a draft until activated.
 */
export function SuggestionCallout({ guard, suggestion }: { readonly guard: Guard; readonly suggestion: GuardSuggestion }) {
  const update = useMutation(updateGuardAtom, { success: guard.status === "active" ? "Mode updated" : "Mode set. Activate the rule when you are ready." })
  const done = applied(guard, suggestion)
  const approval = suggestion.mode === "require_approval"
  const use = () =>
    void update.execute({ id: guard.id, payload: approval ? { mode: suggestion.mode, approvers: suggestion.approvers } : { mode: suggestion.mode } })

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-2.5">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <p>
            {suggestion.cue ? <>“{suggestion.cue}” reads as </> : "Suggested: "}
            <span className="font-semibold">{modeMeta[suggestion.mode].label.toLowerCase()}</span>
            {approval && suggestion.approvers.length > 0 && (
              <>
                {" by "}
                {suggestion.approvers.map((approver, index) => (
                  <span key={JSON.stringify(approver)}>
                    {index > 0 && ", "}
                    <ApproverLabel approver={approver} guard={guard} />
                  </span>
                ))}
              </>
            )}
            .
          </p>
          {suggestion.unresolved.length > 0 && (
            <p className="text-muted-foreground">
              Could not match {suggestion.unresolved.map((name) => `“${name}”`).join(", ")} to a role, team or person; pick approvers in the settings.
            </p>
          )}
        </div>
      </div>
      {done ? (
        <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
          <Check className="size-4" />
          In use
        </span>
      ) : (
        <Button size="sm" variant="secondary" className="shrink-0" disabled={update.pending} onClick={use}>
          {update.pending && <Spinner />}
          {approval ? "Use approval mode" : `Use ${modeMeta[suggestion.mode].label.toLowerCase()} mode`}
        </Button>
      )}
    </div>
  )
}
