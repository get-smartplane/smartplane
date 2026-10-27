import type { AccountMode } from "@pc/domain"
import { ChoiceCards } from "@/components/form/choice-cards"

const choices = [
  { value: "shared", label: "One shared account", description: "You connect it once; everyone you grant uses it." },
  { value: "per_user", label: "Each person's own", description: "Members connect their own account on first use." }
] as const

/** Whose account the tool's calls go through; switchable later from the tool's page. */
export function AccountChoice({ value, onChange }: { readonly value: AccountMode; readonly onChange: (mode: AccountMode) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Whose account?</span> Shared is quickest; per-person means the provider sees who did what.
      </p>
      <ChoiceCards label="Whose account" choices={choices} value={value} onChange={onChange} columns={2} />
    </div>
  )
}
