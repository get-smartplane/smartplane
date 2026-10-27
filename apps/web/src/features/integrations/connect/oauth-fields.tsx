import type { OAuth2PieceAuth } from "@pc/domain"
import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import { useEntityLabel } from "@/lib/lookup/use-entity-label"
import { AuthFieldInput } from "./auth-field-input"
import type { ConnectFieldsProps } from "./field-props"
import { RedirectUri } from "./redirect-uri"

function StoredSecretName({ id }: { readonly id: string }) {
  return <span className="font-medium text-foreground">{useEntityLabel({ kind: "resource", id }).label}</span>
}

function StoredSecretNote({ id }: { readonly id: string }) {
  if (id === "") return <p className="text-sm text-muted-foreground">Choose the stored secret under Advanced options.</p>
  return <p className="text-sm text-muted-foreground">Using <StoredSecretName id={id} />. Change it under Advanced options.</p>
}

/** Your OAuth app at the provider: register the redirect URI there, then paste its client ID and secret. */
export function OAuthFields({ auth, piece, draft, set, errors }: ConnectFieldsProps & { readonly auth: OAuth2PieceAuth }) {
  return (
    <>
      <RedirectUri pieceId={piece.id} pieceName={piece.displayName} title="1. Register this redirect URI" />
      <p className="-mb-2 text-sm font-semibold">2. Paste your OAuth app's credentials</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="connect-client-id" label="Client ID" error={errors["connection.clientId"]}>
          <Input id="connect-client-id" autoComplete="off" spellCheck={false} className="font-mono" value={draft.clientId} aria-invalid={errors["connection.clientId"] !== undefined} onChange={(event) => set("clientId", event.target.value)} />
        </FormField>
        {draft.useStoredSecret ? (
          <FormField id="connect-client-secret" label="Client secret" error={errors["connection.clientSecret"]}>
            <StoredSecretNote id={draft.storedSecretId} />
          </FormField>
        ) : (
          <FormField id="connect-client-secret" label="Client secret" error={errors["connection.clientSecret"]} description="Encrypted on save; never shown again.">
            <Input id="connect-client-secret" type="password" autoComplete="off" spellCheck={false} value={draft.clientSecret} aria-invalid={errors["connection.clientSecret"] !== undefined} onChange={(event) => set("clientSecret", event.target.value)} />
          </FormField>
        )}
      </div>
      {auth.fields.map((field) => (
        <AuthFieldInput key={field.name} field={field} path="connection.props" value={draft.fields[field.name]} onChange={(value) => set("fields", { ...draft.fields, [field.name]: value })} error={errors[`connection.props.${field.name}`]} />
      ))}
    </>
  )
}
