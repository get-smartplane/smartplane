import { grantsAtom } from "@/features/access/atoms"
import { useCan } from "@/features/auth/me-context"
import { guardsAtom } from "@/features/guards/atoms"
import { membersAtom } from "@/features/members/atoms"
import { allResourcesAtom } from "@/features/resources/atoms"
import { inCatalog } from "@/features/resources/kinds"
import { isPast } from "@/lib/format"
import { StatCard } from "./stat-card"

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

/** One strip of counts on a hairline grid (gap-px over the border colour), so cells wrap cleanly on phones. */
export function OverviewStats() {
  const canSeeGrants = useCan("grants:manage")
  const canSeeRules = useCan("guards:manage")
  const sharedOnly = !useCan("resources:manage") && !useCan("resources:browse")
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none [&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1">
      <StatCard
        atom={allResourcesAtom}
        label={sharedOnly ? "Your tools" : "Resources"}
        to="/resources"
        count={(resources) => resources.filter(inCatalog).length}
        detail={(resources) =>
          [plural(resources.filter((r) => r.config.kind === "mcp_server").length, "MCP server"), plural(resources.filter((r) => r.config.kind === "integration").length, "integration")].join(" · ")
        }
      />
      {canSeeGrants && (
        <StatCard
          atom={grantsAtom}
          label="Grants in force"
          to="/access"
          count={(grants) => grants.filter((g) => g.expiresAt === null || !isPast(g.expiresAt)).length}
          detail={(grants) => `${grants.filter((g) => g.conditions.tools !== undefined || g.conditions.arguments !== undefined).length} limited`}
        />
      )}
      {canSeeRules && (
        <StatCard
          atom={guardsAtom}
          label="Rules in force"
          to="/guards"
          count={(guards) => guards.filter((g) => g.status === "active" && g.mode !== "monitor").length}
          detail={(guards) => `${guards.filter((g) => g.status === "active" && g.mode === "monitor").length} monitoring`}
        />
      )}
      <StatCard
        atom={membersAtom}
        label="Members"
        to="/members"
        count={(members) => members.filter((m) => m.status === "active").length}
        detail={(members) => `${members.filter((m) => m.status === "invited").length} invited`}
      />
    </div>
  )
}
