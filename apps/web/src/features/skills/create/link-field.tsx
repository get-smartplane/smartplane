import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import type { SetSourceDraft, SourceDraft } from "./source-draft"

export function LinkField({ draft, set, error }: { readonly draft: SourceDraft; readonly set: SetSourceDraft; readonly error: string | undefined }) {
  return (
    <FormField
      id="skill-link"
      label="URL"
      error={error}
      description="An https:// link to a SKILL.md, or to a .zip or .tar.gz of the skill folder. Fetching it again makes a new version."
    >
      <Input
        id="skill-link"
        type="url"
        inputMode="url"
        className="font-mono"
        placeholder="https://example.com/skills/release-notes.zip"
        autoComplete="off"
        spellCheck={false}
        value={draft.url}
        aria-invalid={error !== undefined}
        onChange={(event) => set("url", event.target.value)}
      />
    </FormField>
  )
}
