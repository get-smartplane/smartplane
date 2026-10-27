import { parseGithubSpec } from "@pc/domain"
import { Result } from "effect"
import { Spinner } from "@/components/ui/spinner"
import type { BundleSource } from "./skill-source"
import type { SourceDraft } from "./source-draft"

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const what = (source: BundleSource, draft: SourceDraft): string => {
  switch (source) {
    case "github":
      return Result.match(parseGithubSpec(draft.spec), {
        onSuccess: ({ repo, path, ref }) => `Fetching ${repo}${path ? `/${path}` : ""}${ref ? `@${ref}` : ""} from GitHub`,
        onFailure: () => "Fetching from GitHub"
      })
    case "link":
      return `Fetching ${hostOf(draft.url.trim())}`
    case "upload":
      return `Uploading ${draft.file?.name ?? "the archive"}`
  }
}

/** Fetching can take a while (a repository archive, a 20 s timeout), so the dialog says what it is doing. */
export function FetchProgress({ source, draft }: { readonly source: BundleSource; readonly draft: SourceDraft }) {
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/6 px-3.5 py-3">
      <Spinner className="mt-0.5 text-brand" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{what(source, draft)}…</span>
        <span className="text-xs text-pretty text-muted-foreground">
          Unpacking the folder, checking it against the limits and recording version 1. You land on the skill when it is done.
        </span>
      </div>
    </div>
  )
}
