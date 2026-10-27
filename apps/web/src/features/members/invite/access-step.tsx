import type { RoleSlug, TeamId } from "@pc/domain"
import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import type { ValueTypeOf } from "@/features/access/argument-limits/argument-limits"
import type { GrantDraft } from "@/features/access/grant-draft"
import { ResourceSelect } from "@/features/resources/resource-select"
import type { FieldErrors } from "@/lib/forms/decode-form"
import { GrantItemRow } from "./grant-item-row"
import { InheritedAccess } from "./inherited-access"
import type { GrantItem } from "./invite-setup"

/** The errors under `prefix`, keyed relative to it: `access.grants.2.expiresAt` → `expiresAt`. */
export const errorsUnder = (errors: FieldErrors, prefix: string): FieldErrors =>
  Object.fromEntries(Object.entries(errors).flatMap(([path, message]) => (path.startsWith(`${prefix}.`) ? [[path.slice(prefix.length + 1), message]] : [])))

interface AccessStepProps {
  readonly grants: ReadonlyArray<GrantItem>
  readonly onAdd: (resourceId: string) => void
  readonly update: (key: number, change: (draft: GrantDraft) => GrantDraft) => void
  readonly onRemove: (key: number) => void
  readonly register: (key: number, valueTypeOf: ValueTypeOf) => void
  readonly teamIds: ReadonlyArray<TeamId>
  readonly role: RoleSlug | undefined
  /** Errors under `access.grants`. */
  readonly errors: FieldErrors
}

/** Direct grants, edited with the grant form's own fields, above the access they already get read-only. */
export function AccessStep({ grants, onAdd, update, onRemove, register, teamIds, role, errors }: AccessStepProps) {
  const [picked, setPicked] = useState("")
  const [openKey, setOpenKey] = useState<number | null>(null)
  const add = () => {
    if (picked === "") return
    onAdd(picked)
    setPicked("")
  }
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5" aria-labelledby="invite-direct">
        <div className="flex flex-col gap-0.5">
          <h3 id="invite-direct" className="font-semibold">Granted to them directly</h3>
          <p className="text-sm text-muted-foreground">Made out to them by name when they accept, and revoked when they are offboarded.</p>
        </div>
        {grants.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {grants.map((item, index) => (
              <GrantItemRow
                key={item.key}
                item={item}
                open={openKey === item.key || Object.keys(errorsUnder(errors, String(index))).length > 0}
                onOpenChange={(open) => setOpenKey(open ? item.key : null)}
                update={(change) => update(item.key, change)}
                onRemove={() => onRemove(item.key)}
                register={register}
                errors={errorsUnder(errors, String(index))}
              />
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <ResourceSelect id="invite-add-resource" value={picked} onChange={setPicked} />
          <Button type="button" variant="outline" disabled={picked === ""} onClick={add}>
            <Plus />
            Add
          </Button>
        </div>
      </section>
      <section className="flex flex-col gap-2.5" aria-labelledby="invite-inherited">
        <div className="flex flex-col gap-0.5">
          <h3 id="invite-inherited" className="font-semibold">Already theirs through teams and role</h3>
          <p className="text-sm text-muted-foreground">Change these on the team or the grant, not here.</p>
        </div>
        <InheritedAccess teamIds={teamIds} role={role} />
      </section>
    </div>
  )
}
