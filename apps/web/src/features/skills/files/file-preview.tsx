import type { ResourceId, SkillFile } from "@pc/domain"
import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { FileText } from "lucide-react"
import type { ReactNode } from "react"
import { ErrorState } from "@/components/query/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { errorOf } from "@/lib/api/outcome"
import { formatBytes } from "../format"
import { asText, bundleAtom } from "./bundle-atom"
import { TextView } from "./text-view"

function Note({ children }: { readonly children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-pretty text-muted-foreground">{children}</p>
}

function Contents({ resourceId, file }: { readonly resourceId: ResourceId; readonly file: SkillFile }) {
  const atom = bundleAtom(resourceId)
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  if (AsyncResult.isFailure(result)) {
    const error = errorOf(result.cause)
    // The bundle endpoint answers "not found" unless the caller holds a read grant, exactly like the gateway.
    if (error._tag === "NotFound") return <Note>Previews download the skill the way agents do, so they need a read grant on it. Grant yourself read access to see file contents.</Note>
    return <div className="p-4"><ErrorState error={error} onRetry={refresh} /></div>
  }
  if (!AsyncResult.isSuccess(result)) {
    return (
      <div className="flex flex-col gap-2 p-4" aria-busy="true" aria-label="Loading file">
        {[80, 64, 72, 40].map((width) => <Skeleton key={width} className="h-3.5" style={{ width: `${width}%` }} />)}
      </div>
    )
  }
  const bytes = result.value.get(file.path)
  if (bytes === undefined) return <Note>This file is not in the version agents are served.</Note>
  const text = asText(bytes)
  if (text === undefined) return <Note>Binary file ({formatBytes(file.size)}). Download the skill to open it.</Note>
  return <TextView text={text} markdown={/\.(md|markdown)$/i.test(file.path)} />
}

interface FilePreviewProps {
  readonly resourceId: ResourceId
  readonly file: SkillFile | undefined
  /** Only the active version can be downloaded, so only its files can be previewed. */
  readonly previewable: boolean
}

export function FilePreview({ resourceId, file, previewable }: FilePreviewProps) {
  return (
    <div className="flex min-h-72 min-w-0 flex-col md:min-h-0" aria-live="polite">
      {file && (
        <div className="flex h-10 shrink-0 items-center gap-3 border-b px-4 text-xs">
          <span className="min-w-0 flex-1 truncate font-mono text-foreground">{file.path}</span>
          {file.mode === "755" && <span className="text-warning-ink">executable</span>}
          <span className="text-muted-foreground tabular-nums">{formatBytes(file.size)}</span>
        </div>
      )}
      {file === undefined ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <FileText className="size-5 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm font-medium">Choose a file to read it</p>
          <p className="max-w-xs text-xs text-pretty text-muted-foreground">Opening a file downloads the skill the way an agent would, so it is recorded in the audit log.</p>
        </div>
      ) : previewable ? (
        <Contents resourceId={resourceId} file={file} />
      ) : (
        <Note>Previews show the version agents are served. Activate this version to read its files here.</Note>
      )}
    </div>
  )
}
