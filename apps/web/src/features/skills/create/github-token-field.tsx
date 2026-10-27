import { FormField } from "@/components/form/form-field"
import { ResourceSelect } from "@/features/resources/resource-select"
import type { SetSourceDraft, SourceDraft } from "./source-draft"

/** Private repositories only; the token is read server-side, audited, and never sent past a redirect. */
export function GithubTokenField({ draft, set, error }: { readonly draft: SourceDraft; readonly set: SetSourceDraft; readonly error: string | undefined }) {
  return (
    <FormField
      id="skill-github-token"
      label="GitHub token"
      error={error}
      description="For private repositories: a secret holding a token that can read it. Public repositories need none."
    >
      <ResourceSelect
        id="skill-github-token"
        kind="secret"
        noneLabel="None (public repository)"
        value={draft.tokenSecretId}
        invalid={error !== undefined}
        onChange={(id) => set("tokenSecretId", id)}
      />
    </FormField>
  )
}
