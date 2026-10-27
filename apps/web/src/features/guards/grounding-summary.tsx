import type { Guard, GuardGrounding, GuardTarget } from "@pc/domain"
import { Check, Plug, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { updateGuardAtom } from "./atoms"
import { PinSummary } from "./pins/pin-summary"

const toolSource = (target: GuardTarget): string => {
  switch (target.tools) {
    case "listing":
      return `${target.toolCount} tools from ${target.name}'s live listing`
    case "catalog":
      return `${target.toolCount} actions of the ${target.product} integration`
    case "curated":
      return `${target.toolCount} tools from ${target.product}'s published list. Connect your ${target.product} account to check against your live tools.`
    case "none":
      return `No tool list for ${target.name}. Connect it to improve accuracy.`
  }
}

const sameSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) => a.length === b.length && a.every((id) => b.includes(id))

/**
 * Which of the org's systems the rule names, where their tools came from, and a one-click way to scope the
 * rule to them. Scoping is never automatic: an unscoped rule keeps checking every resource.
 */
export function GroundingSummary({ guard, grounding }: { readonly guard: Guard; readonly grounding: GuardGrounding }) {
  const update = useMutation(updateGuardAtom, { success: "Scoped. The rule now checks calls to these only." })
  const ids = grounding.targets.map((target) => target.resourceId)
  const scoped = ids.length > 0 && sameSet(guard.resourceIds, ids)
  const names = grounding.targets.map((target) => target.product).join(", ")

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border p-3.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Plug className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Applies to</span>
        {grounding.targets.length === 0 ? (
          <span>no specific integration: every resource in its scope</span>
        ) : (
          grounding.targets.map((target) => (
            <Badge key={target.resourceId} variant="outline" className="font-medium">
              {target.product}
              {target.name !== target.product && <span className="font-normal text-muted-foreground">· {target.name}</span>}
            </Badge>
          ))
        )}
        <span className="ml-auto">
          {scoped ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Check className="size-4" />
              Scoped
            </span>
          ) : ids.length > 0 && guard.resourceIds.length === 0 ? (
            <Button size="sm" variant="secondary" disabled={update.pending} onClick={() => void update.execute({ id: guard.id, payload: { resourceIds: ids } })}>
              {update.pending && <Spinner />}
              Scope to {names}
            </Button>
          ) : null}
        </span>
      </div>
      {grounding.targets.length > 0 && (
        <ul className="flex flex-col gap-1 pl-6 text-muted-foreground">
          {grounding.targets.map((target) => (
            <li key={target.resourceId}>{toolSource(target)}</li>
          ))}
        </ul>
      )}
      <PinSummary guard={guard} />
      {grounding.unknown.map((unknown) => (
        <p key={unknown.product} className="flex items-start gap-2 text-warning-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            The rule names {unknown.product}, which this organisation has not added, so it cannot apply there yet.
          </span>
        </p>
      ))}
    </div>
  )
}
