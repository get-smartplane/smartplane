import { DatabaseEngine } from "@pc/domain"
import { Info } from "lucide-react"
import { FormField } from "@/components/form/form-field"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { ConfigFieldsProps } from "../config-draft"
import { ResourceSelect } from "../resource-select"
import { databaseEngines, engineInfo } from "./database-engines"

export function DatabaseFields({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <>
      <FormField
        id="db-secret"
        label="Connection secret"
        error={errors["config.connectionSecretId"] && "Choose the secret holding the connection string."}
      >
        <ResourceSelect
          id="db-secret"
          kind="secret"
          value={draft.connectionSecretId}
          invalid={errors["config.connectionSecretId"] !== undefined}
          onChange={(id) => set("connectionSecretId", id)}
        />
      </FormField>
    </>
  )
}

export function DatabaseAdvanced({ draft, set, errors }: ConfigFieldsProps) {
  return (
    <>
      <FormField
        id="db-engine"
        label="Engine"
        error={errors["config.engine"]}
        description={engineInfo(draft.engine)?.connectionHint ?? "The connection string is held in the connection secret."}
      >
        <Select value={draft.engine} onValueChange={(value) => set("engine", value)}>
          <SelectTrigger id="db-engine" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DatabaseEngine.literals.map((engine) => (
              <SelectItem key={engine} value={engine}>
                {databaseEngines[engine].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <Field orientation="horizontal">
        <Switch id="db-readonly" checked={draft.readOnly} onCheckedChange={(checked) => set("readOnly", checked)} />
        <FieldContent>
          <FieldLabel htmlFor="db-readonly">Read-only</FieldLabel>
          <FieldDescription>
            Queries run read-only ({draft.engine === "clickhouse" ? "readonly=1" : "a read-only transaction"}), so the database
            itself refuses writes.
          </FieldDescription>
        </FieldContent>
      </Field>
      {!draft.readOnly && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          <span>
            Writable, but only for subjects with a <span className="font-medium text-foreground">write</span> grant on this
            database. A use grant still runs read-only.
          </span>
        </p>
      )}
    </>
  )
}
