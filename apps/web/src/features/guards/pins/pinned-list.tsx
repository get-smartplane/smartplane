import type { Guard } from "@pc/domain"
import { useAtomValue } from "@effect/atom-react"
import { ExternalLink, Pin, TriangleAlert } from "lucide-react"
import { AsyncResult } from "effect/reactivity"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { pinStatsAtom, unpinAtom } from "../atoms"
import { pinKind } from "./pin-kind"

const items = (count: number) => (count === 1 ? "1 item recognised inside it" : `${count} items recognised inside it`)

/**
 * What the rule is pinned to, how many items inside each pin the gateway has recognised from tool results so
 * far, and a warning when a pin could not be found on the last check.
 */
export function PinnedList({ guard }: { readonly guard: Guard }) {
  const unpin = useMutation(unpinAtom, { success: "Unpinned. The rule is judged by meaning alone." })
  const stats = useAtomValue(pinStatsAtom(guard.id))
  const count = (pinId: string) => (AsyncResult.isSuccess(stats) ? stats.value.find((stat) => stat.pinId === pinId)?.children : undefined)

  return (
    <ul className="flex flex-col gap-2" aria-label="Pins">
      {guard.pins.map((pin) => {
        const children = count(pin.id)
        return (
          <li key={pin.id} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Pin className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Pinned to</span>
              <span className="font-medium">{pin.label}</span>
              <span className="text-muted-foreground">({pinKind(guard, pin.resourceId, pin.kind)})</span>
              {pin.url && (
                <a href={pin.url} target="_blank" rel="noreferrer" className="inline-flex items-center text-muted-foreground hover:text-foreground" aria-label={`Open ${pin.label}`}>
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              <Button size="sm" variant="ghost" className="ml-auto" disabled={unpin.pending} onClick={() => void unpin.execute({ id: guard.id, pinId: pin.id })}>
                {unpin.pending && <Spinner />}
                Unpin
              </Button>
            </div>
            <p className="pl-6 text-muted-foreground">
              {children === undefined ? "Counting items recognised inside it…" : children === 0 ? "No items recognised inside it yet: they are picked up as agents read it." : `${items(children)}, from what agents have read.`}
            </p>
            {pin.missing === true && (
              <p className="flex items-start gap-2 pl-6 text-warning-ink">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>{pin.label} could not be found on the last check: it may have been deleted, or your account lost access. The rule still checks calls by meaning; unpin it, or verify again to pin the right one.</span>
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
