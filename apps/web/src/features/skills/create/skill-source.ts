import type { LucideIcon } from "lucide-react"
import { FolderGit2, Link2, PenLine, Upload } from "lucide-react"

/** Where a new skill's content comes from; `inline` is the markdown editor skills always had. */
export type SkillSource = "github" | "upload" | "link" | "inline"
export type BundleSource = Exclude<SkillSource, "inline">

export const skillSources: ReadonlyArray<SkillSource> = ["github", "upload", "link", "inline"]

export const sourceMeta: { readonly [S in SkillSource]: { readonly label: string; readonly icon: LucideIcon; readonly description: string } } = {
  github: { label: "GitHub", icon: FolderGit2, description: "A skill folder in a repository, pinned to a commit." },
  upload: { label: "Upload", icon: Upload, description: "A .zip or .tar.gz of a skill folder." },
  link: { label: "Link", icon: Link2, description: "A URL to a SKILL.md or an archive." },
  inline: { label: "Write", icon: PenLine, description: "Markdown instructions written here." }
}

/** The server's caps for one skill folder (docs/skills.md, "Limits and safety"). */
export const archiveLimits = { maxBytes: 5 * 1024 * 1024, maxFiles: 500 } as const

export const isBundle = (source: SkillSource): source is BundleSource => source !== "inline"
