import type { ResourceId, SkillVersion } from "@pc/domain"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { refetchSkillAtom } from "../atoms"
import { useSkillMutation } from "../use-skill-mutation"

/** Links cannot say whether they changed, so fetching again simply records a new version. */
export function RefetchButton({ resourceId, onFetched }: { readonly resourceId: ResourceId; readonly onFetched: (version: SkillVersion) => void }) {
  const fetching = useSkillMutation(refetchSkillAtom)
  const run = async () => {
    const outcome = await fetching.execute(resourceId)
    if (outcome._tag === "Success") onFetched(outcome.value)
  }
  return (
    <Button variant="outline" disabled={fetching.pending} onClick={() => void run()}>
      {fetching.pending ? <Spinner /> : <RefreshCw />}
      Fetch new version
    </Button>
  )
}
