import { ConnectSecret, type ResourceId } from "@pc/domain"
import { Redacted } from "effect"
import { KeyRound } from "lucide-react"
import { useState } from "react"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useMutation } from "@/lib/api/use-mutation"
import { useForm } from "@/lib/forms/use-form"
import { connectSecretAtom } from "./atoms"

const messages = { value: "Paste the token or key (up to 64 KB)." }

interface ConnectSecretDialogProps {
  readonly resourceId: ResourceId
  readonly resourceName: string
  readonly label: string
  /** `basic` and `custom` integrations take a JSON object of their fields. */
  readonly json?: boolean
}

/** Connects the caller's own token or API key to a per-user resource. Nobody else, admins included, can read it. */
export function ConnectSecretDialog({ resourceId, resourceName, label, json = false }: ConnectSecretDialogProps) {
  const [value, setValue] = useState("")
  const connect = useMutation(connectSecretAtom, { success: `Your ${resourceName} account is connected` })
  const form = useForm(ConnectSecret, { ...connect, execute: (payload) => connect.execute({ id: resourceId, value: payload.value }) }, messages)
  const id = `connect-${resourceId}`
  return (
    <FormDialog
      trigger={
        <Button size="sm">
          <KeyRound />
          {label}
        </Button>
      }
      title={`Connect your ${resourceName} account`}
      description="Calls you make through this resource use it. It is stored encrypted and is never shown again, to you or to admins."
      submitLabel="Connect"
      form={form}
      input={() => ({ value: Redacted.make(value) })}
      onOpenChange={(open) => open || setValue("")}
    >
      <FormField id={id} label={json ? "Credentials (JSON)" : "Token or API key"} error={form.errors.value}>
        {json ? (
          <Textarea id={id} rows={5} spellCheck={false} className="font-mono text-xs" value={value} aria-invalid={form.errors.value !== undefined} onChange={(event) => setValue(event.target.value)} />
        ) : (
          <Input id={id} type="password" autoComplete="off" spellCheck={false} value={value} aria-invalid={form.errors.value !== undefined} onChange={(event) => setValue(event.target.value)} />
        )}
      </FormField>
    </FormDialog>
  )
}
