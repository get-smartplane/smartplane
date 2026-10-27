import { Link } from "@tanstack/react-router"
import { Boxes, Plug, ShieldCheck } from "lucide-react"
import { CopyButton } from "@/components/form/copy-button"
import { SkyField } from "@/components/sky/sky-field"
import { Button } from "@/components/ui/button"
import { useCan, useMe } from "@/features/auth/me-context"
import { apiOrigin } from "@/lib/api/http"

const mcpUrl = `${apiOrigin}/mcp`

const clouds = [
  { seed: 21, left: 44, top: 6, width: 13 },
  { seed: 3, left: 72, top: 52, width: 22 },
  { seed: 12, left: 90, top: 4, width: 14 },
  { seed: 7, left: 56, top: 74, width: 12 }
] as const

/** The overview's header: the org, its one MCP endpoint, and the three ways to get started. */
export function SkyBand() {
  const { org } = useMe()
  const canAddResources = useCan("resources:manage")
  const canWriteRules = useCan("guards:manage")
  return (
    <SkyField clouds={clouds} plane={{ left: 80, top: 22, width: 9 }} className="rounded-xl px-5 py-6 md:px-7 md:py-7">
      <div className="flex flex-col gap-5 md:max-w-[62%]">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[1.875rem] leading-9">{org.name}</h1>
          <p className="text-[0.9375rem] text-sky-ink/80">One endpoint for every agent. Each call is checked, then recorded.</p>
        </div>
        <div className="flex max-w-xl items-center gap-2 rounded-md bg-card p-1.5 pl-3 ring-1 ring-plane-line/80 dark:ring-border">
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">MCP endpoint</span>
          <code className="min-w-0 flex-1 truncate text-[0.8125rem] text-foreground">{mcpUrl}</code>
          <CopyButton text={mcpUrl} label="Copy" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/tokens">
              <Plug />
              Connect a client
            </Link>
          </Button>
          {canAddResources && (
            <Button variant="outline" asChild>
              <Link to="/resources">
                <Boxes />
                Add a resource
              </Link>
            </Button>
          )}
          {canWriteRules && (
            <Button variant="outline" asChild>
              <Link to="/guards">
                <ShieldCheck />
                Write a rule
              </Link>
            </Button>
          )}
        </div>
      </div>
    </SkyField>
  )
}
