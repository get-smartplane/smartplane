import type { SkillVersion } from "@pc/domain"
import { useState } from "react"
import { Section } from "@/components/layout/section"
import { formatBytes, plural } from "../format"
import { buildTree, totalSize } from "./file-tree"
import { FilePreview } from "./file-preview"
import { FileTreeView } from "./file-tree-view"

/** The selected version's files; a file opens read-only beside the tree. */
export function FilesSection({ version }: { readonly version: SkillVersion }) {
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const file = version.files.find((candidate) => candidate.path === selected)
  return (
    <Section
      title="Files"
      description={`Version ${version.version}${version.active ? " (active)" : ""} · ${plural(version.files.length, "file")} · ${formatBytes(totalSize(version.files))}`}
    >
      <div className="grid overflow-hidden rounded-xl border bg-card md:h-[26rem] md:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label="Skill files" className="max-h-72 overflow-y-auto border-b p-1.5 md:max-h-none md:border-r md:border-b-0">
          <FileTreeView nodes={buildTree(version.files)} selected={selected} onSelect={(next) => setSelected(next.path)} />
        </nav>
        <FilePreview resourceId={version.resourceId} file={file} previewable={version.active} />
      </div>
    </Section>
  )
}
