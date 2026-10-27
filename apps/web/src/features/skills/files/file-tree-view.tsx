import type { SkillFile } from "@pc/domain"
import { ChevronRight, FileTerminal, FileText, Folder } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { formatBytes } from "../format"
import type { FolderNode, TreeNode } from "./file-tree"

interface TreeProps {
  readonly nodes: ReadonlyArray<TreeNode>
  readonly selected: string | undefined
  readonly onSelect: (file: SkillFile) => void
  readonly depth?: number
}

const row = "flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-[0.8125rem] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
const indent = (depth: number) => ({ paddingLeft: `${0.5 + depth * 1}rem` })

/** Executable scripts are marked, because they are what an agent might run. */
function ExecMark() {
  return (
    <span className="rounded-sm bg-warning/20 px-1 font-mono text-[0.625rem] leading-4 font-semibold text-warning-ink" title="Executable (mode 755)">
      exec<span className="sr-only">utable</span>
    </span>
  )
}

function FolderRow({ node, depth, ...rest }: Omit<TreeProps, "nodes"> & { readonly node: FolderNode; readonly depth: number }) {
  const [open, setOpen] = useState(true)
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(row, "text-muted-foreground hover:bg-accent/50 hover:text-foreground")} style={indent(depth)}>
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <Folder className="size-3.5 shrink-0" strokeWidth={1.75} />
        <span className="truncate font-medium">{node.name}</span>
      </button>
      {open && <FileTreeView nodes={node.children} depth={depth + 1} {...rest} />}
    </li>
  )
}

/** Folders fold; each file is a button that opens its preview. Plain buttons keep Tab order predictable. */
export function FileTreeView({ nodes, selected, onSelect, depth = 0 }: TreeProps) {
  return (
    <ul className="flex flex-col" aria-label={depth === 0 ? "Files" : undefined}>
      {nodes.map((node) => {
        if (node.kind === "folder") return <FolderRow key={node.path} node={node} depth={depth} selected={selected} onSelect={onSelect} />
        const { file } = node
        const current = file.path === selected
        const Icon = file.mode === "755" ? FileTerminal : FileText
        return (
          <li key={file.path}>
            <button
              type="button"
              aria-current={current ? "true" : undefined}
              onClick={() => onSelect(file)}
              className={cn(row, current ? "bg-brand/10 text-foreground" : "hover:bg-accent/50")}
              style={indent(depth + 0.85)}
            >
              <Icon className={cn("size-3.5 shrink-0", current ? "text-brand" : "text-muted-foreground")} strokeWidth={1.75} />
              <span className={cn("min-w-0 flex-1 truncate", current && "font-semibold")}>{node.name}</span>
              {file.mode === "755" && <ExecMark />}
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
