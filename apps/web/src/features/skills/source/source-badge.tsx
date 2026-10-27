import type { SkillConfig, SkillVersion } from "@pc/domain"
import { skillSourceOf } from "@pc/domain"
import { ArrowUpRight } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { sourceMeta } from "../create/skill-source"
import { shortSha } from "../format"
import { githubUrl } from "./github-url"

const chip = "inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-md border bg-card px-2 text-xs text-muted-foreground"

function Chip({ source, href, children }: { readonly source: keyof typeof sourceMeta; readonly href?: string; readonly children: ReactNode }) {
  const Icon = sourceMeta[source].icon
  const body = (
    <>
      <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{children}</span>
      {href && <ArrowUpRight className="size-3 shrink-0" />}
    </>
  )
  if (href === undefined) return <span className={chip}>{body}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn(chip, "transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 outline-none")}>
      {body}
    </a>
  )
}

/**
 * Where the skill comes from. With the active version known, GitHub shows the exact commit agents are
 * served (repo@short-sha) and links to that tree; otherwise the configured ref.
 */
export function SkillSourceBadge({ config, active }: { readonly config: SkillConfig; readonly active?: SkillVersion | undefined }) {
  const source = skillSourceOf(config)
  switch (config.source) {
    case "github": {
      const commit = active?.source.type === "github" ? active.source.commit : undefined
      const at = commit === undefined ? config.ref : shortSha(commit)
      return (
        <Chip source={source} href={githubUrl(config.repo, commit ?? config.ref, config.path)}>
          <span className="font-mono">
            {config.repo}
            {config.path ? `/${config.path}` : ""}
            {at ? `@${at}` : ""}
          </span>
        </Chip>
      )
    }
    case "link":
      return <Chip source={source} href={config.url}><span className="font-mono">{config.url.replace(/^https:\/\//, "")}</span></Chip>
    case "upload":
      return <Chip source={source}>Uploaded{active?.source.type === "upload" && active.source.filename ? ` · ${active.source.filename}` : ""}</Chip>
    default:
      return <Chip source={source}>Written here</Chip>
  }
}
