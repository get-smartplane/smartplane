import type { PieceAuth } from "@pc/domain"
import { FormField } from "@/components/form/form-field"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ProjectSelect } from "@/features/projects/project-select"
import { ResourceSelect } from "@/features/resources/resource-select"
import { isOffered } from "../actions/action-groups"
import { ActionsPicker } from "../actions/actions-picker"
import type { ConnectFieldsProps } from "./field-props"

function Toggle({ id, label, description, checked, onChange }: { readonly id: string; readonly label: string; readonly description: string; readonly checked: boolean; readonly onChange: (on: boolean) => void }) {
  return (
    <Field orientation="horizontal">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
    </Field>
  )
}

/** Everything with a safe default: org-wide, every action, a fresh client secret, no description. */
export function ConnectAdvanced({ auth, piece, draft, set, errors }: ConnectFieldsProps & { readonly auth: PieceAuth | undefined }) {
  const offered = piece.actions.filter(isOffered)
  const limit = (on: boolean) => {
    set("limitActions", on)
    if (on && draft.actions.length === 0) set("actions", offered.map((action) => action.name))
  }
  return (
    <>
      <FormField id="connect-project" label="Visible in" description="A project's integrations are only reachable with tokens scoped to it.">
        <ProjectSelect id="connect-project" value={draft.projectId} onChange={(id) => set("projectId", id)} />
      </FormField>
      <Toggle id="connect-limit" label="Only offer some actions" description={`Without a list, all ${offered.length} actions are offered; grants still decide who may call them.`} checked={draft.limitActions} onChange={limit} />
      {draft.limitActions && (
        <FormField id="connect-actions" label="Offered actions" error={errors.actions && "Choose at least one action."}>
          <ActionsPicker id="connect-actions" actions={offered} value={draft.actions} onChange={(names) => set("actions", names)} invalid={errors.actions !== undefined} />
        </FormField>
      )}
      {auth?.type === "oauth2" && (
        <>
          <Toggle id="connect-stored" label="Use a client secret already stored" description="For several integrations that share one OAuth app." checked={draft.useStoredSecret} onChange={(on) => set("useStoredSecret", on)} />
          {draft.useStoredSecret && (
            <FormField id="connect-stored-secret" label="Stored client secret" error={errors["connection.clientSecret"]}>
              <ResourceSelect id="connect-stored-secret" kind="secret" value={draft.storedSecretId} invalid={errors["connection.clientSecret"] !== undefined} onChange={(id) => set("storedSecretId", id)} />
            </FormField>
          )}
          {auth.scopes.length > 0 && (
            <FormField id="connect-scopes" label="Access it asks for" description="The provider shows these on its consent screen.">
              <p id="connect-scopes" className="flex flex-wrap gap-1">
                {auth.scopes.map((scope) => <code key={scope} className="rounded-sm bg-card px-1.5 py-0.5 text-xs ring-1 ring-border">{scope}</code>)}
              </p>
            </FormField>
          )}
        </>
      )}
      <FormField id="connect-description" label="Description" error={errors.description}>
        <Textarea id="connect-description" rows={2} value={draft.description} onChange={(event) => set("description", event.target.value)} />
      </FormField>
    </>
  )
}
