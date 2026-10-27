import { parseGithubSpec } from "@pc/domain"
import { Result } from "effect"
import { FormField } from "@/components/form/form-field"
import { ArchiveDropZone } from "./archive-drop-zone"
import { FetchProgress } from "./fetch-progress"
import { GithubField } from "./github-field"
import { GithubTokenField } from "./github-token-field"
import { LinkField } from "./link-field"
import { isBundle } from "./skill-source"
import { SourceFailure } from "./source-failure"
import type { SkillSourceState } from "./use-skill-source"

/** The chosen bundle source's field, then either what is happening (fetching) or why it failed. */
export function SkillSourceFields({ state }: { readonly state: SkillSourceState }) {
  const { source, draft, set, form, failure } = state
  if (!isBundle(source)) return null
  const pick = (folder: string) => {
    const spec = Result.getOrUndefined(parseGithubSpec(draft.spec))
    if (spec === undefined) return
    set("spec", `${spec.repo}/${folder}${spec.ref ? `@${spec.ref}` : ""}`)
    form.reset()
  }
  return (
    <>
      <fieldset disabled={form.pending} className="contents">
        {source === "github" && <GithubField draft={draft} set={set} error={form.errors.spec} />}
        {source === "link" && <LinkField draft={draft} set={set} error={form.errors.url} />}
        {source === "upload" && (
          <FormField id="skill-archive" label="Archive" error={form.errors.file}>
            <ArchiveDropZone id="skill-archive" file={draft.file} onFile={(file) => set("file", file)} invalid={form.errors.file !== undefined} />
          </FormField>
        )}
      </fieldset>
      {form.pending ? <FetchProgress source={source} draft={draft} /> : failure && <SourceFailure failure={failure} onPick={source === "github" ? pick : undefined} />}
    </>
  )
}

/** Only GitHub has options worth folding away: the token for private repositories. */
export function SkillSourceAdvanced({ state }: { readonly state: SkillSourceState }) {
  return state.source === "github" ? <GithubTokenField draft={state.draft} set={state.set} error={state.form.errors.tokenSecretId} /> : null
}
