import type { IntegrationPiece, OAuthReturnTo } from "@pc/domain"
import { useNavigate } from "@tanstack/react-router"
import { Plug } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { AdvancedOptions } from "@/components/form/advanced-options"
import { FormDialog } from "@/components/form/form-dialog"
import { FormField } from "@/components/form/form-field"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { projectsAtom } from "@/features/projects/atoms"
import { useForm } from "@/lib/forms/use-form"
import { isOffered } from "../actions/action-groups"
import { ConnectAdvanced } from "./connect-advanced"
import { authFor, initialDraft, toConnectInput, type ConnectDraft } from "./connect-draft"
import { connectMessages, connectSchema } from "./connect-schema"
import { CredentialFields } from "./credential-fields"
import { MethodPicker } from "./method-picker"
import { useConnect, type Connected } from "./use-connect"

const advancedKeys = ["description", "projectId", "actions"]

interface ConnectDialogProps {
  readonly piece: IntegrationPiece
  readonly trigger?: ReactNode
  /** Where OAuth2 sign-in returns to; the integration's own page when absent. */
  readonly returnTo?: OAuthReturnTo
  /** Replaces the default "go to the integration's page" (and the OAuth2 redirect) once it is created. */
  readonly onConnected?: (connected: Connected) => void
}

/** Connects a piece in one dialog, adapting to how it signs in; OAuth2 continues at the provider. */
export function ConnectDialog({ piece, trigger, returnTo, onConnected }: ConnectDialogProps) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<ConnectDraft>(() => initialDraft(piece))
  const set = <K extends keyof ConnectDraft>(key: K, value: ConnectDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const auth = authFor(piece, draft.method)
  const schema = useMemo(() => connectSchema(auth), [auth])
  const form = useForm(schema, useConnect(piece, returnTo), useMemo(() => connectMessages(auth), [auth]))
  const projectName = useQueryData(projectsAtom(false), []).find((project) => project.id === draft.projectId)?.name ?? "Org-wide"
  const actionCount = draft.limitActions ? draft.actions.length : piece.actions.filter(isOffered).length
  const fieldProps = { piece, draft, set, errors: form.errors }

  const done = (connected: Connected) => {
    if (onConnected) return onConnected(connected)
    const { resource, authorizeUrl } = connected
    if (authorizeUrl !== null) return window.location.assign(authorizeUrl)
    if (auth?.type !== "oauth2") toast.success(`${resource.name} is connected`, { description: "Grant access to let agents use it." })
    void navigate({ to: "/resources/$resourceId", params: { resourceId: resource.id } })
  }

  return (
    <FormDialog
      trigger={trigger ?? <Button><Plug />Connect</Button>}
      title={`Connect ${piece.displayName}`}
      description="Credentials are encrypted and never shown to agents. You get full access right away; others once you grant it."
      submitLabel={auth?.type === "oauth2" ? `Connect with ${piece.displayName}` : "Connect"}
      wide
      form={form}
      input={() => toConnectInput(auth, draft)}
      onSuccess={done}
      // Drop any typed credential from memory as soon as the dialog closes.
      onOpenChange={(open) => open || setDraft(initialDraft(piece))}
    >
      <MethodPicker piece={piece} value={draft.method} onChange={(method) => setDraft((d) => ({ ...d, method, fields: {} }))} />
      <FormField id="connect-name" label="Name" error={form.errors.name} description="How it appears in grants and the audit log.">
        <Input id="connect-name" value={draft.name} aria-invalid={form.errors.name !== undefined} onChange={(event) => set("name", event.target.value)} />
      </FormField>
      <CredentialFields auth={auth} {...fieldProps} />
      <AdvancedOptions
        summary={[projectName, `${actionCount} actions`].join(" · ")}
        forceOpen={Object.keys(form.errors).some((key) => advancedKeys.includes(key) || (draft.useStoredSecret && key.startsWith("connection.clientSecret")))}
      >
        <ConnectAdvanced auth={auth} {...fieldProps} />
      </AdvancedOptions>
    </FormDialog>
  )
}
