import { CircleAlert, FolderOpen } from "lucide-react"
import { useEffect, useRef } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { SkillFailure } from "../skill-error"

interface SourceFailureProps {
  readonly failure: SkillFailure
  /** Offered for GitHub, whose spec can name a folder; other sources only list what they hold. */
  readonly onPick?: (folder: string) => void
}

/** Why fetching failed, in plain words; when a source holds several skills, the folders to pick from. */
export function SourceFailure({ failure, onPick }: SourceFailureProps) {
  const ref = useRef<HTMLDivElement>(null)
  // Dialogs scroll; a failure below the fold would look like nothing happened.
  useEffect(() => ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), [failure])
  return (
    <Alert ref={ref} variant="destructive">
      <CircleAlert />
      <AlertTitle>{failure.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>{failure.description}</span>
        {failure.candidates.length > 0 && (
          <ul aria-label="Skill folders" className="flex flex-wrap gap-1.5">
            {failure.candidates.map((folder) => (
              <li key={folder}>
                {onPick ? (
                  <button
                    type="button"
                    onClick={() => onPick(folder)}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-destructive/25 bg-card px-2 py-0.5 font-mono text-xs text-foreground transition-colors outline-none hover:border-brand hover:bg-brand/8 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <FolderOpen className="size-3 text-muted-foreground" />
                    {folder}
                  </button>
                ) : (
                  <span className="rounded-sm bg-card px-2 py-0.5 font-mono text-xs text-foreground">{folder}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {failure.candidates.length > 0 && !onPick && <span>Upload one skill folder at a time.</span>}
      </AlertDescription>
    </Alert>
  )
}
