import type { PieceAuth } from "@pc/domain"
import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import { AuthFieldInput } from "./auth-field-input"
import type { ConnectFieldsProps } from "./field-props"
import { OAuthFields } from "./oauth-fields"

const secretInput = (id: string, value: string, invalid: boolean, onChange: (value: string) => void) => (
  <Input id={id} type="password" autoComplete="off" spellCheck={false} value={value} aria-invalid={invalid} onChange={(event) => onChange(event.target.value)} />
)

/** The credential inputs for the chosen connection method; whatever is typed is encrypted on save. */
export function CredentialFields({ auth, ...props }: ConnectFieldsProps & { readonly auth: PieceAuth | undefined }) {
  const { piece, draft, set, errors } = props
  const setField = (name: string, value: string | boolean) => set("fields", { ...draft.fields, [name]: value })
  switch (auth?.type) {
    case undefined:
      return <p className="text-sm text-muted-foreground">{piece.displayName} needs no sign-in. Agents can use it as soon as you grant access.</p>
    case "secret_text":
      return (
        <FormField id="connect-secret" label={auth.displayName || "API key"} error={errors["connection.secret"]} description={<span className="line-clamp-3">{auth.description ?? "Encrypted on save; never shown again."}</span>}>
          {secretInput("connect-secret", draft.secret, errors["connection.secret"] !== undefined, (value) => set("secret", value))}
        </FormField>
      )
    case "basic":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="connect-username" label={auth.username.displayName || "Username"} error={errors["connection.username"]} description={auth.username.description}>
            <Input id="connect-username" autoComplete="off" value={draft.username} aria-invalid={errors["connection.username"] !== undefined} onChange={(event) => set("username", event.target.value)} />
          </FormField>
          <FormField id="connect-password" label={auth.password.displayName || "Password"} error={errors["connection.password"]} description={auth.password.description}>
            {secretInput("connect-password", draft.password, errors["connection.password"] !== undefined, (value) => set("password", value))}
          </FormField>
        </div>
      )
    case "custom":
      return auth.fields.map((field) => (
        <AuthFieldInput key={field.name} field={field} path="connection.fields" value={draft.fields[field.name]} onChange={(value) => setField(field.name, value)} error={errors[`connection.fields.${field.name}`]} />
      ))
    case "oauth2":
      return <OAuthFields auth={auth} {...props} />
  }
}
