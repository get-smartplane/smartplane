import type { AccountMode, ResourceId } from "@pc/domain"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { Switch } from "@/components/ui/switch"
import { useMutation } from "@/lib/api/use-mutation"
import { setModeAtom } from "./atoms"

/** "Each person connects their own account": switching deletes the other mode's accounts, so it is confirmed. */
export function ModeSwitch({ resourceId, mode, disabled }: { readonly resourceId: ResourceId; readonly mode: AccountMode; readonly disabled: boolean }) {
  const setMode = useMutation(setModeAtom, { success: "Account mode changed" })
  const next: AccountMode = mode === "shared" ? "per_user" : "shared"
  return (
    <ConfirmDialog
      trigger={<Switch checked={mode === "per_user"} disabled={disabled} aria-label="Each person connects their own account" />}
      title={next === "per_user" ? "Let each person connect their own account?" : "Use one shared account?"}
      description={
        next === "per_user"
          ? <p>The shared account is disconnected. Each member with a grant connects their own; their calls fail with "connect your account" until they do.</p>
          : <p>Every member's own account is disconnected. An admin connects one account that everyone with a grant then uses; grants and rules still apply per person.</p>
      }
      confirmLabel="Switch"
      onConfirm={async () => (await setMode.execute({ id: resourceId, mode: next }))._tag === "Success"}
    />
  )
}
