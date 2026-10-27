import { IntegrationAuthType } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { Blocks } from "lucide-react"
import { FormField } from "@/components/form/form-field"
import { useQueryData } from "@/components/query/use-query-data"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { catalogAtom } from "@/features/integrations/atoms"
import { authTypeLabel } from "@/features/integrations/auth-methods"
import { PieceSelect } from "@/features/integrations/piece-select"
import type { ConfigFieldsProps } from "../config-draft"
import { ResourceSelect } from "../resource-select"

const secretContents: { readonly [T in IntegrationAuthType]: string } = {
  none: "",
  secret_text: "The secret holding the API key or token.",
  basic: 'The secret holding JSON: {"username": "…", "password": "…"}.',
  custom: "The secret holding a JSON object of the piece's connection fields.",
  oauth2: "The secret holding the OAuth app's client secret. Sign in from the integration's page after saving."
}

/** The manual path: reference secrets already stored. The catalog's Connect flow stores them for you. */
export function IntegrationFields({ draft, set, errors }: ConfigFieldsProps) {
  const piece = useQueryData(catalogAtom, []).find((candidate) => candidate.id === draft.pieceId)
  const type = IntegrationAuthType.literals.find((literal) => literal === draft.connectionType)
  return (
    <>
      <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <Blocks className="size-3.5 shrink-0" />
        <span>
          Quicker: <Link to="/integrations" className="font-medium text-foreground underline-offset-2 hover:underline">connect from Integrations</Link>, which stores the key for you.
        </span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="integration-piece" label="Integration" error={errors["config.pieceId"] && "Choose an integration."}>
          <PieceSelect id="integration-piece" value={draft.pieceId} invalid={errors["config.pieceId"] !== undefined} onChange={(next) => {
            set("pieceId", next.id)
            set("connectionType", next.authTypes[0] ?? "none")
            set("limitActions", false)
            set("actions", [])
          }} />
        </FormField>
        <FormField id="integration-method" label="Connect with" error={errors["config.connection"] && !errors["config.connection.secretId"] && !errors["config.connection.clientId"] ? "Choose how it signs in." : undefined}>
          <Select value={draft.connectionType} onValueChange={(value) => set("connectionType", value)} disabled={piece === undefined}>
            <SelectTrigger id="integration-method" className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {(piece?.authTypes ?? []).map((authType) => <SelectItem key={authType} value={authType}>{authTypeLabel[authType]}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      {type === "oauth2" && (
        <FormField id="integration-client-id" label="Client ID" error={errors["config.connection.clientId"]}>
          <Input id="integration-client-id" className="font-mono" value={draft.clientId} onChange={(event) => set("clientId", event.target.value)} />
        </FormField>
      )}
      {type !== undefined && type !== "none" && (
        <FormField id="integration-secret" label={type === "oauth2" ? "Client secret" : "Credential secret"} description={secretContents[type]} error={(errors["config.connection.secretId"] ?? errors["config.connection.clientSecretId"]) && "Choose a secret."}>
          <ResourceSelect id="integration-secret" kind="secret" value={draft.secretId} onChange={(id) => set("secretId", id)} />
        </FormField>
      )}
    </>
  )
}
