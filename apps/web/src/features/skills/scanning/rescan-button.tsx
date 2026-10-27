import type { SkillVersion } from "@pc/domain"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { rescanVersionAtom } from "../atoms"

export function RescanButton({ version }: { readonly version: SkillVersion }) {
  const rescan = useMutation(rescanVersionAtom, { success: `Re-scanning version ${version.version}` })
  return (
    <Button variant="outline" disabled={rescan.pending} onClick={() => void rescan.execute({ id: version.resourceId, version: version.version })}>
      {rescan.pending ? <Spinner /> : <RefreshCw />}
      Re-scan
    </Button>
  )
}
