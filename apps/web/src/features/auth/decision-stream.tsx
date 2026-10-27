import { StatusText } from "@/components/status/status-badge"
import type { Tone } from "@/components/status/tone"

const decisions: ReadonlyArray<{ readonly verdict: string; readonly tone: Tone; readonly call: string; readonly who: string; readonly why: string }> = [
  { verdict: "Allowed", tone: "success", call: "github.search_code", who: "ada@acme.dev", why: "Platform team · use" },
  { verdict: "Blocked", tone: "danger", call: "drive.delete_file", who: "ci-agent", why: "Rule: Protect Q3 reports" },
  { verdict: "Held", tone: "warning", call: "warehouse.query", who: "grace@acme.dev", why: "Waiting for approval" },
  { verdict: "Allowed", tone: "success", call: "linear.create_issue", who: "ada@acme.dev", why: "Role: Admin · write" }
]

/** An illustration of the gateway's decision log, drawn as the product draws it. */
export function DecisionStream() {
  return (
    <div data-ui className="overflow-hidden rounded-lg bg-card text-card-foreground ring-[1.5px] ring-plane-line dark:ring-border">
      <div className="flex items-center justify-between border-b px-4 py-2.5 text-xs text-muted-foreground">
        <span className="font-semibold">Gateway decisions</span>
        <StatusText tone="success">Chain intact</StatusText>
      </div>
      <ul className="divide-y divide-border/80">
        {decisions.map(({ verdict, tone, call, who, why }) => (
          <li key={call} className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-3 px-4 py-2.5 text-sm">
            <span className="font-medium">
              <StatusText tone={tone}>{verdict}</StatusText>
            </span>
            <code className="truncate text-[0.8125rem]">{call}</code>
            <span />
            <span className="truncate text-xs text-muted-foreground">
              {who} · {why}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
