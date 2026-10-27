import { envNameOf, type Resource } from "@pc/domain"
import { Check, Pencil, X } from "lucide-react"
import { useState, type FormEvent } from "react"
import { RowAction } from "@/components/form/row-action"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { updateDeliveryAtom } from "./atoms"
import { deliveryProblem, envNamePayload, envNameProblem, explicitEnvName, normalizeEnvName } from "./env-name"

interface EnvNameEditorProps {
  readonly resource: Resource
  readonly canEdit: boolean
  /** In a narrow cell, the "from name" note gives way to the name itself (it stays in the tooltip). */
  readonly compact?: boolean
}

/** The name a value is delivered under, editable in place: Enter saves, Escape cancels, empty returns to the derived name. */
export function EnvNameEditor({ resource, canEdit, compact = false }: EnvNameEditorProps) {
  const effective = envNameOf(resource)
  const derived = explicitEnvName(resource) === undefined
  const [draft, setDraft] = useState<string>()
  const [problem, setProblem] = useState<string>()
  const update = useMutation(updateDeliveryAtom, { quiet: true, success: "Env name saved" })

  const close = () => {
    setDraft(undefined)
    setProblem(undefined)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (draft === undefined) return
    const invalid = envNameProblem(draft)
    if (invalid !== undefined) return setProblem(invalid)
    if (draft === effective) return close()
    const outcome = await update.execute({ id: resource.id, payload: { envName: envNamePayload(resource, draft) } })
    if (outcome._tag === "Success") return close()
    setProblem(deliveryProblem(outcome.error, draft))
  }

  if (draft === undefined) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <code className="truncate rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs" title={derived ? "Derived from the name" : undefined}>
          {effective ?? "No env name"}
        </code>
        {derived && !compact && <span className="shrink-0 text-xs text-muted-foreground">from name</span>}
        {canEdit && (
          <RowAction label={`Edit env name of ${resource.name}`} className="-my-1 size-6" onClick={() => setDraft(effective ?? "")}>
            <Pencil className="size-3.5" />
          </RowAction>
        )}
      </span>
    )
  }

  const id = `env-name-${resource.id}`
  return (
    <form onSubmit={save} noValidate className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="sr-only">Env name of {resource.name}</label>
        <Input
          id={id}
          autoFocus
          value={draft}
          placeholder={derived ? effective : undefined}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={problem !== undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          className="h-7 max-w-56 font-mono text-xs md:text-xs"
          onChange={(event) => {
            setDraft(normalizeEnvName(event.target.value))
            setProblem(undefined)
          }}
          onKeyDown={(event) => event.key === "Escape" && (event.stopPropagation(), close())}
        />
        <RowAction label="Save env name" type="submit" className="size-7" disabled={update.pending}>
          {update.pending ? <Spinner /> : <Check />}
        </RowAction>
        <RowAction label="Cancel" type="button" className="size-7" onClick={close}>
          <X />
        </RowAction>
      </div>
      {problem && <p id={`${id}-problem`} role="alert" className="max-w-72 text-xs text-pretty text-danger-ink">{problem}</p>}
    </form>
  )
}
