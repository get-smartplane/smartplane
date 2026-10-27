import { FileArchive, Upload, X } from "lucide-react"
import { useState, type DragEvent } from "react"
import { RowAction } from "@/components/form/row-action"
import { cn } from "@/lib/utils"
import { formatBytes } from "../format"
import { archiveLimits } from "./skill-source"

interface ArchiveDropZoneProps {
  readonly id: string
  readonly file: File | null
  readonly onFile: (file: File | null) => void
  readonly invalid?: boolean
}

const accept = ".zip,.tar.gz,.tgz,.tar,application/zip,application/gzip,application/x-tar"

/** A real file input under a large target: click, keyboard (Space/Enter on the input) and drag-and-drop all work. */
export function ArchiveDropZone({ id, file, onFile, invalid }: ArchiveDropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files[0]
    if (dropped !== undefined) onFile(dropped)
  }
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={cn(
          "flex cursor-pointer items-center rounded-lg border border-dashed text-foreground transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
          file === null ? "flex-col gap-2 px-4 py-6 text-center" : "gap-3 px-3 py-2.5",
          dragging ? "border-brand bg-brand/8" : invalid ? "border-destructive/60" : "border-input hover:bg-accent/40"
        )}
      >
        <input id={id} type="file" accept={accept} className="sr-only" aria-invalid={invalid} onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
        <span className={cn("flex shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground", file === null ? "size-9" : "size-7")}>
          <Upload className="size-4" strokeWidth={1.75} />
        </span>
        <span className="text-sm">
          <span className="font-semibold">{file === null ? "Drop a .zip or .tar.gz" : "Drop another archive"}</span>
          <span className="text-muted-foreground"> or </span>
          <span className="font-semibold text-brand underline-offset-4 hover:underline">browse</span>
        </span>
        {file === null && (
          <span className="text-xs text-muted-foreground">
            Up to {formatBytes(archiveLimits.maxBytes)} and {archiveLimits.maxFiles} files, with SKILL.md at the top of the folder
          </span>
        )}
      </label>
      {file !== null && (
        <div className="flex items-center gap-2.5 rounded-md border bg-card px-3 py-2 text-sm text-foreground">
          <FileArchive className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
          <RowAction label={`Remove ${file.name}`} onClick={() => onFile(null)}>
            <X />
          </RowAction>
        </div>
      )}
    </div>
  )
}
