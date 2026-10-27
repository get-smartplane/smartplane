import type { ResourceId } from "@pc/domain"
import { LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { startOAuthAtom } from "../atoms"

interface ReconnectButtonProps {
  readonly resourceId: ResourceId
  readonly label: string
  readonly variant?: "default" | "outline"
}

/** Starts a fresh OAuth sign-in and leaves for the provider; the callback brings the browser back here. */
export function ReconnectButton({ resourceId, label, variant = "default" }: ReconnectButtonProps) {
  const start = useMutation(startOAuthAtom)
  const go = async () => {
    const outcome = await start.execute({ id: resourceId })
    if (outcome._tag === "Success") window.location.assign(outcome.value.authorizeUrl)
  }
  return (
    <Button variant={variant} disabled={start.pending} onClick={() => void go()}>
      {start.pending ? <Spinner /> : <LogIn />}
      {label}
    </Button>
  )
}
