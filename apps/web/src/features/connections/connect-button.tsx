import type { ConnectMethod, Resource, ResourceId } from "@pc/domain"
import { LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { startConnectionAtom } from "./atoms"
import { ConnectSecretDialog } from "./connect-secret-dialog"

/** Enough of a resource to connect it. */
export interface ResourceRef {
  readonly id: ResourceId
  readonly name: string
}

interface ConnectButtonProps {
  readonly resource: ResourceRef
  readonly method: ConnectMethod
  readonly label: string
  readonly variant?: "default" | "outline"
}

/** `basic` and `custom` integrations keep a JSON object of their fields. */
export const takesJson = (resource: Resource): boolean =>
  resource.config.kind === "integration" && (resource.config.connection.type === "basic" || resource.config.connection.type === "custom")

/** Signs in at the provider (OAuth: leaves for it, the callback brings the browser back) or takes a pasted key. */
export function ConnectButton({ resource, method, label, variant = "default", json = false }: ConnectButtonProps & { readonly json?: boolean }) {
  const start = useMutation(startConnectionAtom)
  if (method === "secret") return <ConnectSecretDialog resourceId={resource.id} resourceName={resource.name} label={label} json={json} />
  if (method !== "oauth") return null
  const go = async () => {
    const outcome = await start.execute(resource.id)
    if (outcome._tag === "Success") window.location.assign(outcome.value.authorizeUrl)
  }
  return (
    <Button size="sm" variant={variant} disabled={start.pending} onClick={() => void go()}>
      {start.pending ? <Spinner /> : <LogIn />}
      {label}
    </Button>
  )
}
