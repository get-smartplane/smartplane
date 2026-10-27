import type { ResourceKind } from "@pc/domain"
import { Plus } from "lucide-react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCan } from "@/features/auth/me-context"
import { CreateValueDialog } from "@/features/secrets/create-value-dialog"
import { resourcesAtom } from "./atoms"
import { kindMeta } from "./kinds"

const none = "none"

interface ResourceSelectProps {
  readonly id: string
  /** Restricts the options to one kind (e.g. the secret holding an API key). */
  readonly kind?: ResourceKind
  readonly value: string
  readonly onChange: (id: string) => void
  readonly invalid?: boolean
  /** Shown as the first option when the reference is optional. */
  readonly noneLabel?: string
}

/**
 * Emits "" for none; the form's schema validates the id. Picking a secret also offers creating one on the
 * spot, so adding a resource never means leaving its form for the Secrets page.
 */
export function ResourceSelect(props: ResourceSelectProps) {
  const canCreate = useCan("resources:manage")
  if (props.kind !== "secret" || !canCreate) return <Picker {...props} />
  return (
    <div className="flex flex-col items-start gap-1">
      <Picker {...props} />
      <CreateValueDialog
        kind="secret"
        onCreated={(secret) => props.onChange(secret.id)}
        trigger={
          <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs">
            <Plus className="size-3" />
            Create a new secret
          </Button>
        }
      />
    </div>
  )
}

function Picker({ id, kind, value, onChange, invalid, noneLabel }: ResourceSelectProps) {
  const resources = useQueryData(resourcesAtom(kind === undefined ? {} : { kind }), [])
  const selected = value === "" && noneLabel ? none : value
  return (
    <Select value={selected} onValueChange={(next) => onChange(next === none ? "" : next)}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
        <SelectValue placeholder="Choose…" />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={none}>{noneLabel}</SelectItem>}
        {resources.map((resource) => {
          const { label, icon: Icon } = kindMeta[resource.config.kind]
          return (
            <SelectItem key={resource.id} value={resource.id}>
              {kind === undefined && <Icon aria-label={label} />}
              {resource.name}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
