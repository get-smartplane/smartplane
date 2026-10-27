import { AccessTokenKind, MaxTokenTtlDays, type ProjectId } from "@pc/domain"
import { Schema } from "effect"
import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProjectSelect } from "@/features/projects/project-select"
import type { FieldErrors } from "@/lib/forms/decode-form"

export interface TokenDraft {
  readonly name: string
  readonly kind: AccessTokenKind
  readonly projectId: ProjectId | null
  readonly ttlDays: number
}

const isKind = Schema.is(AccessTokenKind)
const kindLabels = { personal: "Personal — acts as you", service_account: "Service account — its own grant subject" } as const

interface TokenFormFieldsProps {
  readonly draft: TokenDraft
  readonly onChange: (draft: TokenDraft) => void
  readonly errors: FieldErrors
  readonly canCreateServiceAccounts: boolean
}

/** What the defaults amount to, for the folded "Advanced" row. */
export const tokenSummary = (draft: TokenDraft, projectName: string | undefined) =>
  [draft.kind === "personal" ? "Acts as you" : "Service account", projectName ?? "All projects", `expires in ${draft.ttlDays} days`].join(" · ")

export function TokenNameField({ draft, onChange, errors }: Omit<TokenFormFieldsProps, "canCreateServiceAccounts">) {
  return (
    <FormField id="token-name" label="Name" error={errors.name} description="Where it will be used, so you recognise it later.">
      <Input id="token-name" autoFocus placeholder="Laptop — Claude Code" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
    </FormField>
  )
}

/** Type, project scope and lifetime; the defaults (personal, every project, 30 days) suit a laptop. */
export function TokenAdvancedFields({ draft, onChange, errors, canCreateServiceAccounts }: TokenFormFieldsProps) {
  return (
    <>
      <FormField id="token-kind" label="Type">
        <Select value={draft.kind} onValueChange={(kind) => isKind(kind) && onChange({ ...draft, kind })}>
          <SelectTrigger id="token-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AccessTokenKind.literals.map((kind) => (
              <SelectItem key={kind} value={kind} disabled={kind === "service_account" && !canCreateServiceAccounts}>
                {kindLabels[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="token-project" label="Project scope">
          <ProjectSelect id="token-project" value={draft.projectId} onChange={(projectId) => onChange({ ...draft, projectId })} orgWideLabel="All projects" />
        </FormField>
        <FormField id="token-ttl" label="Expires after (days)" error={errors.ttlDays} description={`At most ${MaxTokenTtlDays} days.`}>
          <Input
            id="token-ttl"
            type="number"
            min={1}
            max={MaxTokenTtlDays}
            value={Number.isNaN(draft.ttlDays) ? "" : draft.ttlDays}
            aria-invalid={errors.ttlDays !== undefined}
            onChange={(e) => onChange({ ...draft, ttlDays: e.target.valueAsNumber })}
          />
        </FormField>
      </div>
    </>
  )
}
