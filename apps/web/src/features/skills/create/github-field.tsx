import { parseGithubSpec, type GithubSpec } from "@pc/domain"
import { Result } from "effect"
import type { ReactNode } from "react"
import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import type { SetSourceDraft, SourceDraft } from "./source-draft"

function Part({ label, children, muted }: { readonly label: string; readonly children: ReactNode; readonly muted?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground italic" : "truncate font-mono text-foreground"}>{children}</span>
    </span>
  )
}

/** What the pasted text resolved to, so a typo shows before anything is fetched. */
function Resolved({ spec }: { readonly spec: GithubSpec }) {
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <Part label="Repository">{spec.repo}</Part>
      <Part label="Folder" muted={spec.path === undefined}>{spec.path ?? "found automatically"}</Part>
      <Part label="Ref" muted={spec.ref === undefined}>{spec.ref ?? "default branch"}</Part>
    </span>
  )
}

export function GithubField({ draft, set, error }: { readonly draft: SourceDraft; readonly set: SetSourceDraft; readonly error: string | undefined }) {
  const parsed = parseGithubSpec(draft.spec)
  const typed = draft.spec.trim() !== ""
  const hint = Result.isSuccess(parsed) ? (
    <Resolved spec={parsed.success} />
  ) : typed ? (
    "Not a GitHub skill yet. Use owner/repo, owner/repo/path@ref or a github.com URL."
  ) : (
    <>
      For example <code>anthropics/skills/skills/pdf@main</code> or a github.com link to the folder.
    </>
  )
  return (
    <FormField id="skill-github" label="Repository" error={error} description={<span aria-live="polite">{hint}</span>}>
      <Input
        id="skill-github"
        className="font-mono"
        placeholder="owner/repo/path@ref"
        autoComplete="off"
        spellCheck={false}
        value={draft.spec}
        aria-invalid={error !== undefined}
        onChange={(event) => set("spec", event.target.value)}
      />
    </FormField>
  )
}
