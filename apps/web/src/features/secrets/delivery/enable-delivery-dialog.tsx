import { envNameOf, type Resource } from "@pc/domain"
import { useState } from "react"
import { FormField } from "@/components/form/form-field"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { updateDeliveryAtom } from "./atoms"
import { deliveryProblem, envNamePayload, envNameProblem, explicitEnvName, normalizeEnvName } from "./env-name"

interface EnableDeliveryDialogProps {
  readonly secret: Resource
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onEnabled?: (secret: Resource) => void
}

/**
 * The one way a secret becomes deliverable, from the Secrets table and from the machine-token allow-list alike.
 * The trade-off comes from the threat model (docs/secrets-delivery.md): delivery stops accidental leaks, not
 * code running in the same process, so the most dangerous keys belong behind the gateway.
 */
export function EnableDeliveryDialog({ secret, open, onOpenChange, onEnabled }: EnableDeliveryDialogProps) {
  const [envName, setEnvName] = useState(envNameOf(secret) ?? "")
  const [problem, setProblem] = useState<string>()
  const update = useMutation(updateDeliveryAtom, { quiet: true, success: `${secret.name} can now be delivered` })
  const id = `enable-env-${secret.id}`

  const changeOpen = (next: boolean) => {
    if (next) setEnvName(envNameOf(secret) ?? "")
    setProblem(undefined)
    onOpenChange(next)
  }

  const confirm = async () => {
    const invalid = envName === "" ? "Set the env name it is delivered under." : envNameProblem(envName)
    if (invalid !== undefined) return setProblem(invalid)
    const keep = envName === envNameOf(secret) && explicitEnvName(secret) === undefined
    const payload = keep ? { delivery: "deliverable" as const } : { delivery: "deliverable" as const, envName: envNamePayload(secret, envName) }
    const outcome = await update.execute({ id: secret.id, payload })
    if (outcome._tag === "Failure") return setProblem(deliveryProblem(outcome.error, envName))
    onEnabled?.(outcome.value)
    changeOpen(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Let commands and services receive {secret.name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2 text-sm text-pretty text-muted-foreground">
              <p>
                Members with a use grant get it through <code className="font-mono text-foreground">smartplane run</code>, and machine tokens that list it
                receive it at boot. Any code in that process can read it, so keep production root keys and broad live keys gateway-only.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormField id={id} label="Env name" error={problem} description="The environment variable the command or service reads.">
          <Input
            id={id}
            value={envName}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={problem !== undefined}
            className="font-mono"
            onChange={(event) => {
              setEnvName(normalizeEnvName(event.target.value))
              setProblem(undefined)
            }}
          />
        </FormField>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={update.pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={update.pending}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {update.pending && <Spinner />}
            Allow delivery
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
