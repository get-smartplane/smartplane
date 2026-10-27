import { deliverability, envNameOf, type Resource } from "@pc/domain"
import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { useCan } from "@/features/auth/me-context"
import { useMutation } from "@/lib/api/use-mutation"
import { cn } from "@/lib/utils"
import { updateDeliveryAtom } from "./atoms"
import { DeliveryStats } from "./delivery-stats"
import { EnableDeliveryDialog } from "./enable-delivery-dialog"
import { EnvNameEditor } from "./env-name-editor"

/**
 * A secret's delivery switch, off by default (gateway only). Turning it on confirms the trade-off first;
 * turning it off needs no confirm, since it only narrows where the value can go.
 * `idSuffix` keeps ids unique when the same control renders in the mobile and desktop layouts.
 */
export function DeliveryControl({ secret, idSuffix }: { readonly secret: Resource; readonly idSuffix: string }) {
  const [confirming, setConfirming] = useState(false)
  const canReadAudit = useCan("audit:read")
  const deliverable = deliverability(secret.config) === "deliverable"
  const update = useMutation(updateDeliveryAtom, {
    success: `${envNameOf(secret) ?? secret.name} is gateway-only again`,
    successDetail: "Commands and machine tokens stop receiving it on their next fetch."
  })
  const id = `delivery-${secret.id}-${idSuffix}`

  const change = (on: boolean) => {
    if (on) return setConfirming(true)
    void update.execute({ id: secret.id, payload: { delivery: "gateway_only" } })
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-start gap-2.5">
        <Switch id={id} className="mt-px" checked={deliverable} disabled={update.pending} onCheckedChange={change} />
        <label htmlFor={id} className={cn("cursor-pointer text-[0.8125rem] leading-tight text-pretty", !deliverable && "text-muted-foreground")}>
          Can be delivered to commands and services
        </label>
      </div>
      {/* Off is the default and the section says so; only a delivered secret needs more than the switch. */}
      {deliverable && (
        <div className="flex min-w-0 flex-col gap-1 pl-[2.625rem]">
          <EnvNameEditor resource={secret} canEdit />
          {canReadAudit && <DeliveryStats resourceId={secret.id} />}
        </div>
      )}
      <EnableDeliveryDialog secret={secret} open={confirming} onOpenChange={setConfirming} />
    </div>
  )
}
