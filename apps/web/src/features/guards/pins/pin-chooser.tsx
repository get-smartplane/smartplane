import type { Guard, GuardPinLookup } from "@pc/domain"
import { ExternalLink } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { cn } from "@/lib/utils"
import { confirmPinAtom, continueVerifyAtom, dismissPinsAtom } from "../atoms"
import { pinKind } from "./pin-kind"

const None = "none"

/**
 * The candidates verify's lookup found for the thing the rule names, for the admin to confirm one, or say
 * none of them is it. Nothing is pinned until they confirm. A verify run waiting for this goes on testing
 * after either, or without a decision.
 */
export function PinChooser({ guard, lookup }: { readonly guard: Guard; readonly lookup: GuardPinLookup }) {
  const [picked, setPicked] = useState<string>(lookup.candidates[0]?.entityId ?? None)
  const confirm = useMutation(confirmPinAtom, { success: "Pinned. Calls that touch it, or items inside it, are now named to the classifier." })
  const dismiss = useMutation(dismissPinsAtom, { success: "Not pinned. The rule is judged by meaning alone." })
  const skip = useMutation(continueVerifyAtom, { success: "Testing without a pin. You can still pin it later." })
  const paused = guard.verify?.stage === "needs_confirmation"
  const pending = confirm.pending || dismiss.pending || skip.pending
  const submit = () => {
    const candidate = lookup.candidates.find((c) => c.entityId === picked)
    if (candidate === undefined) return void dismiss.execute(guard.id)
    void confirm.execute({ id: guard.id, payload: { resourceId: candidate.resourceId, entityId: candidate.entityId } })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p>
        The rule names <span className="font-medium">“{lookup.mention}”</span>. Which one is it? Pinning it lets Smartplane recognise calls that
        only give its id, or the id of something inside it.
      </p>
      <div role="radiogroup" aria-label="What the rule names" className="flex flex-col divide-y rounded-lg border">
        {[...lookup.candidates.map((c) => ({ key: c.entityId, candidate: c })), { key: None, candidate: undefined }].map(({ key, candidate }) => {
          const checked = picked === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setPicked(key)}
              className={cn("flex min-w-0 items-start gap-3 px-3 py-2.5 text-left outline-none first:rounded-t-lg last:rounded-b-lg focus-visible:ring-3 focus-visible:ring-ring/50", checked ? "bg-brand/8" : "hover:bg-accent/50")}
            >
              <span aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0 rounded-full border", checked ? "border-[5px] border-brand" : "border-input")} />
              {candidate === undefined ? (
                <span className="text-muted-foreground">None of these</span>
              ) : (
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{candidate.label}</span>
                    <span className="text-xs text-muted-foreground">{pinKind(guard, candidate.resourceId, candidate.kind)}</span>
                    {candidate.url && (
                      <a href={candidate.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        Open <ExternalLink className="size-3" />
                      </a>
                    )}
                  </span>
                  <code className="truncate font-mono text-xs text-muted-foreground">{candidate.entityId}</code>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending} onClick={submit}>
          {(confirm.pending || dismiss.pending) && <Spinner />}
          {picked === None ? "Confirm: none of these" : "Pin it"}
        </Button>
        {/* The verify run waits here; it can also go on without a decision. */}
        {paused && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => void skip.execute(guard.id)}>
            {skip.pending && <Spinner />}
            Test without pinning
          </Button>
        )}
      </div>
    </div>
  )
}
