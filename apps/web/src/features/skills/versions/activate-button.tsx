import type { SkillVersion } from "@pc/domain"
import { ConfirmDialog } from "@/components/form/confirm-dialog"
import { Button } from "@/components/ui/button"
import { useMutation } from "@/lib/api/use-mutation"
import { activateVersionAtom } from "../atoms"

/** Switching what agents are served is deliberate, so it confirms; the previous version stays one click away. */
export function ActivateButton({ version, current }: { readonly version: SkillVersion; readonly current: number | undefined }) {
  const activate = useMutation(activateVersionAtom, { success: `Version ${version.version} is now served to agents` })
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="outline">Activate</Button>}
      title={`Serve version ${version.version}?`}
      description={
        <>
          <p>Agents get version {version.version} on their next request{current === undefined ? "" : ` instead of version ${current}`}.</p>
          <p>You can activate {current === undefined ? "another version" : `version ${current}`} again at any time. The switch is recorded in the audit log.</p>
        </>
      }
      confirmLabel="Activate"
      onConfirm={async () => (await activate.execute({ id: version.resourceId, version: version.version }))._tag === "Success"}
    />
  )
}
