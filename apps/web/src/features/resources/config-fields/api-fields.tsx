import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ConfigFieldsProps } from "../config-draft"
import { ResourceSelect } from "../resource-select"
import { ApiMethodsField } from "./api-methods-field"

export function ApiFields({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <>
      <FormField id="api-url" label="Base URL" error={errors["config.baseUrl"]}>
        <Input
          id="api-url"
          placeholder="https://api.example.com/v1"
          value={draft.baseUrl}
          aria-invalid={errors["config.baseUrl"] !== undefined}
          onChange={(event) => set("baseUrl", event.target.value)}
        />
      </FormField>
    </>
  )
}

export function ApiAdvanced({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="api-auth" label="Authentication secret" error={errors["config.authSecretId"]}>
          <ResourceSelect
            id="api-auth"
            kind="secret"
            noneLabel="No authentication"
            value={draft.authSecretId}
            onChange={(id) => set("authSecretId", id)}
          />
        </FormField>
        <FormField id="api-header" label="Auth header" error={errors["config.authHeader"]} description="Defaults to Authorization: Bearer.">
          <Input
            id="api-header"
            className="font-mono"
            placeholder="X-Api-Key"
            value={draft.authHeader}
            onChange={(event) => set("authHeader", event.target.value)}
          />
        </FormField>
      </div>
      <FormField
        id="api-methods"
        label="Allowed methods"
        error={errors["config.allowedMethods"] && "Allow at least one method."}
        description="GET and HEAD only read. Every other method also needs a write grant."
      >
        <ApiMethodsField
          value={draft.allowedMethods}
          invalid={errors["config.allowedMethods"] !== undefined}
          onChange={(methods) => set("allowedMethods", methods)}
        />
      </FormField>
      <FormField
        id="api-paths"
        label="Allowed path prefixes"
        error={errors["config.allowedPaths"] && "One prefix per line, starting with / (no query, fragment or ..)."}
        description="One per line, such as /v1/customers. Leave blank to allow any path under the base URL."
      >
        <Textarea
          id="api-paths"
          rows={3}
          className="font-mono text-xs"
          placeholder={"/v1/customers\n/v1/invoices"}
          value={draft.allowedPaths}
          aria-invalid={errors["config.allowedPaths"] !== undefined}
          onChange={(event) => set("allowedPaths", event.target.value)}
        />
      </FormField>
    </>
  )
}
