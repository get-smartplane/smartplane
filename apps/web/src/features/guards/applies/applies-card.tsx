import { type Guard, type GuardActorRef, type GuardApplies, sameApplies } from "@pc/domain"
import { Check, Filter, X } from "lucide-react"
import { type ReactNode, useState } from "react"
import { EntityName } from "@/components/status/entity-name"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { updateGuardAtom } from "../atoms"
import { type Dimension, dimensionsOf, listWords, resourceName, toolWords, without } from "./applies-words"

function ActorName({ actor }: { readonly actor: GuardActorRef }) {
  if (actor._tag === "Role") return <span>the {actor.role} role</span>
  return <EntityName entity={actor._tag === "Team" ? { kind: "team", id: actor.teamId } : { kind: "user", id: actor.userId }} className="inline-flex" />
}

function Chip({ children, onRemove, label }: { readonly children: ReactNode; readonly onRemove?: (() => void) | undefined; readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 font-medium">
      {children}
      {onRemove !== undefined && (
        <button type="button" className="-mr-1 rounded-sm p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Stop narrowing by ${label}`} onClick={onRemove}>
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

/** "Checks only: Notion · update page and create pages · tools that change things · everyone except Finance". */
function Words({ guard, applies, onRemove }: { readonly guard: Guard; readonly applies: GuardApplies; readonly onRemove?: (dimension: Dimension) => void }) {
  const grounding = guard.compiled?.grounding
  const remove = (dimension: Dimension) => (onRemove === undefined ? undefined : () => onRemove(dimension))
  const tools = (applies.tools ?? []).map((scope, _, all) => ({ scope, words: toolWords(scope, grounding, all.length > 1) }))
  const actors = applies.actors
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">Checks only:</span>
        <Chip label="system" onRemove={applies.resourceIds.length > 0 ? remove("resources") : undefined}>
          {applies.resourceIds.length === 0 ? "every system" : listWords(applies.resourceIds.map((id) => resourceName(grounding, id)))}
        </Chip>
        {tools.length > 0 && <Chip label="tool" onRemove={remove("tools")}>{tools.map(({ words }) => words.checks).join("; ")}</Chip>}
        {applies.operations === "changes" && <Chip label="kind of tool" onRemove={remove("operations")}>tools that change things</Chip>}
        <Chip label="person" onRemove={actors === undefined ? undefined : remove("actors")}>
          {actors === undefined ? "everyone" : (
            <span className="inline-flex flex-wrap items-baseline gap-1">
              {actors.kind === "only" ? "only" : "everyone except"}
              {actors.refs.map((actor, index) => (
                <span key={JSON.stringify(actor)} className="inline-flex items-baseline gap-1">
                  {index > 0 && <span>{index === actors.refs.length - 1 ? "and" : ","}</span>}
                  <ActorName actor={actor} />
                </span>
              ))}
            </span>
          )}
        </Chip>
      </p>
      <ul className="flex flex-col gap-1 text-muted-foreground">
        {tools.filter(({ words }) => words.skips !== "").map(({ scope, words }) => (
          <li key={scope.resourceId}>Leaves out {words.skips} on {resourceName(grounding, scope.resourceId)}. Tools it adds later are still checked.</li>
        ))}
        {applies.operations === "changes" && <li>Read-only tools are skipped; a tool that does not say what it does counts as one that changes things.</li>}
        {actors?.kind === "except" && <li>Calls by them are allowed outright, without asking the classifier.</li>}
      </ul>
    </div>
  )
}

/**
 * Which calls the rule is checked on, in plain words, for the admin to accept, edit or clear: the same pattern
 * as scoping and pinning. Until accepted the rule checks every call in its scope. A skipped call never reaches
 * the classifier, so what is left out is spelled out.
 */
export function AppliesCard({ guard }: { readonly guard: Guard }) {
  const update = useMutation(updateGuardAtom, { success: "Saved. The rule is checked on these calls only." })
  const clear = useMutation(updateGuardAtom, { success: "The rule is checked on every call in its scope again." })
  const suggested = guard.compiled?.applies
  const accepted = guard.applies
  const [editing, setEditing] = useState<GuardApplies | null>(null)
  const shown = editing ?? accepted ?? suggested
  if (guard.compiled === null) return null
  if (shown === undefined) {
    return (
      <p className="flex items-start gap-2 rounded-lg border p-3.5 text-sm text-muted-foreground">
        <Filter className="mt-0.5 size-4 shrink-0" />
        <span>Checks every call in its scope. The rule is not about specific systems, tools or people verify could be sure of, so nothing is skipped.</span>
      </p>
    )
  }
  const save = (applies: GuardApplies) => void update.execute({ id: guard.id, payload: { applies } }).then((outcome) => outcome._tag === "Success" && setEditing(null))
  const remove = (dimension: Dimension) => setEditing(without(shown, dimension))
  const narrowsNothing = dimensionsOf(shown).length === 0
  const newer = accepted !== null && suggested !== undefined && !sameApplies(accepted, suggested) && editing === null

  return (
    <section aria-label="Calls it checks" className={accepted === null ? "flex flex-col gap-3 rounded-lg border border-dashed p-3.5 text-sm" : "flex flex-col gap-3 rounded-lg border p-3.5 text-sm"}>
      <header className="flex items-center gap-2">
        <Filter className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="font-semibold">Calls it checks</h3>
        <span className="text-xs text-muted-foreground">{editing !== null ? "Editing" : accepted === null ? "Suggested by verify" : sameApplies(accepted, suggested) ? "In use" : "In use, edited"}</span>
      </header>
      <Words guard={guard} applies={shown} {...(editing === null ? {} : { onRemove: remove })} />
      {accepted === null && editing === null && (
        <p className="text-muted-foreground">Until you accept it, the rule checks every call in its scope. Calls outside it skip the classifier, so fewer calls wait on it.</p>
      )}
      {newer && suggested !== undefined && (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2.5">
          <p className="text-muted-foreground">The latest verify suggests a different filter:</p>
          <Words guard={guard} applies={suggested} />
          <Button size="sm" variant="secondary" className="self-start" disabled={update.pending} onClick={() => save(suggested)}>Use the new suggestion</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {editing !== null ? (
          <>
            <Button size="sm" disabled={update.pending || narrowsNothing} onClick={() => save(editing)}>
              {update.pending && <Spinner />}
              Save filter
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            {narrowsNothing && <span className="text-xs text-muted-foreground">Nothing left to narrow by: clear it instead.</span>}
          </>
        ) : (
          <>
            {accepted === null ? (
              <Button size="sm" variant="secondary" disabled={update.pending} onClick={() => save(shown)}>
                {update.pending ? <Spinner /> : <Check />}
                Check only these calls
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setEditing(shown)}>Edit</Button>
            {accepted !== null && (
              <Button size="sm" variant="ghost" disabled={clear.pending} onClick={() => void clear.execute({ id: guard.id, payload: { applies: null } })}>
                {clear.pending && <Spinner />}
                Check every call
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  )
}
