import type { MachineToken } from "@pc/domain"
import { ServerCog, TriangleAlert } from "lucide-react"
import { useState } from "react"
import { EmptyState } from "@/components/layout/empty-state"
import { Section } from "@/components/layout/section"
import { QueryView } from "@/components/query/query-view"
import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/format"
import { machineTokensAtom } from "./atoms"
import { CreateMachineTokenDialog } from "./create-machine-token-dialog"
import { expiresSoon } from "./expiry"
import { MachineTokensTable } from "./machine-tokens-table"

/** Names the tokens a service would lose soon, so a renewal is planned rather than discovered at boot. */
function ExpiringNotice({ tokens }: { readonly tokens: ReadonlyArray<MachineToken> }) {
  const soon = tokens.filter(expiresSoon)
  const first = soon[0]
  if (first === undefined) return null
  const what = soon.length === 1 ? `${first.name} expires ${formatRelative(first.expiresAt)}` : `${soon.length} tokens expire within two weeks`
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg bg-warning/12 px-3 py-2.5 text-sm text-warning-ink dark:bg-warning/10">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium">{what}.</span> Renew before then, or the service fails at its next boot.
      </span>
    </p>
  )
}

function TokenList({ tokens }: { readonly tokens: ReadonlyArray<MachineToken> }) {
  const [showRevoked, setShowRevoked] = useState(false)
  const active = tokens.filter((token) => token.revokedAt === null)
  const revoked = tokens.length - active.length
  if (tokens.length === 0) {
    return (
      <EmptyState
        icon={ServerCog}
        title="No machine tokens"
        description="Create one per deployed service. It fetches the service's secrets at boot, so they no longer sit in the platform's settings."
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <ExpiringNotice tokens={active} />
      <MachineTokensTable tokens={showRevoked ? tokens : active} canRenew />
      {revoked > 0 && (
        <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setShowRevoked(!showRevoked)}>
          {showRevoked ? "Hide revoked" : `Show ${revoked} revoked`}
        </Button>
      )}
    </div>
  )
}

/**
 * Lives on Secrets & variables rather than Connect & tokens: a machine token is defined by the secrets it may
 * receive, creating one needs `resources:manage` as well as `tokens:manage`, and "make deliverable" is the
 * step right before it. Connect & tokens stays about connecting MCP clients, and links here.
 */
export function MachineTokensSection() {
  return (
    <Section
      id="machine-tokens"
      title="Machine tokens"
      description="Credentials for deployed services. Each one receives only the values on its list, at boot, and expires within 90 days."
      aside={<CreateMachineTokenDialog variant="outline" />}
    >
      <QueryView atom={machineTokensAtom}>{(tokens) => <TokenList tokens={tokens} />}</QueryView>
    </Section>
  )
}
