import type { SkillSourceSnapshot } from "@pc/domain"
import { GitCommitHorizontal } from "lucide-react"
import { shortSha } from "../format"
import { githubUrl } from "../source/github-url"

/** Where one version came from: its commit, its file name, or the link it was fetched from. */
export function VersionSource({ source }: { readonly source: SkillSourceSnapshot }) {
  switch (source.type) {
    case "github":
      return (
        <a
          href={githubUrl(source.repo, source.commit, source.path)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          aria-label={`Commit ${shortSha(source.commit)} on GitHub`}
        >
          <GitCommitHorizontal className="size-3.5" />
          {shortSha(source.commit)}
        </a>
      )
    case "upload":
      return <span className="block truncate text-xs text-muted-foreground" title={source.filename}>{source.filename ?? "Uploaded"}</span>
    case "link":
      return <span className="block truncate text-xs text-muted-foreground">Fetched from link</span>
    case "inline":
      return <span className="text-xs text-muted-foreground">Written here</span>
  }
}
