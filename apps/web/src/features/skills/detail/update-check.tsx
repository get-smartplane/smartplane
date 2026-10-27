import type { ResourceId, SkillUpdateCheck, SkillVersion } from "@pc/domain"
import { Check, Download, RefreshCw } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { checkUpdatesAtom, refetchSkillAtom } from "../atoms"
import { shortSha } from "../format"
import { useSkillMutation } from "../use-skill-mutation"

interface UpdateCheckProps {
  readonly resourceId: ResourceId
  readonly onFetched: (version: SkillVersion) => void
}

/** GitHub only: ask whether the ref moved, then offer to fetch it as a new (not yet active) version. */
export function UpdateCheck({ resourceId, onFetched }: UpdateCheckProps) {
  const [check, setCheck] = useState<SkillUpdateCheck | null>(null)
  const checking = useSkillMutation(checkUpdatesAtom)
  const fetching = useSkillMutation(refetchSkillAtom)

  const run = async () => {
    const outcome = await checking.execute(resourceId)
    if (outcome._tag === "Success") setCheck(outcome.value)
  }
  const fetchNew = async () => {
    const outcome = await fetching.execute(resourceId)
    if (outcome._tag !== "Success") return
    setCheck(null)
    onFetched(outcome.value)
  }

  if (check?.updateAvailable) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground lg:inline" aria-live="polite">
          <span className="font-mono">{check.ref}</span> is at <span className="font-mono">{shortSha(check.latestCommit)}</span>
        </span>
        <Button disabled={fetching.pending} onClick={() => void fetchNew()}>
          {fetching.pending ? <Spinner /> : <Download />}
          Fetch new version
        </Button>
      </div>
    )
  }
  return (
    <Button variant="outline" disabled={checking.pending} onClick={() => void run()} aria-live="polite">
      {checking.pending ? <Spinner /> : check ? <Check /> : <RefreshCw />}
      {check ? `Up to date with ${check.ref}` : "Check for updates"}
    </Button>
  )
}
