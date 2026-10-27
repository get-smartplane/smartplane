import type { ScanFinding } from "@pc/domain"
import { StatusBadge } from "@/components/status/status-badge"
import { severityMeta, severityOrder } from "../versions/scan-status"

const location = (finding: ScanFinding): string | undefined =>
  finding.file === undefined ? undefined : finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`

function Finding({ finding }: { readonly finding: ScanFinding }) {
  const where = location(finding)
  return (
    <li className="flex flex-col gap-0.5 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-sm font-semibold">{finding.title}</span>
        {where && <span className="font-mono text-xs text-foreground/80">{where}</span>}
        <span className="ml-auto font-mono text-[0.6875rem] text-muted-foreground">{finding.ruleId}</span>
      </div>
      <p className="text-sm text-pretty text-muted-foreground">{finding.detail}</p>
    </li>
  )
}

/** Most severe first, each group headed by its severity and count. */
export function FindingsList({ findings }: { readonly findings: ReadonlyArray<ScanFinding> }) {
  if (findings.length === 0) return <p className="text-sm text-muted-foreground">No findings.</p>
  return (
    <div className="flex flex-col gap-3">
      {severityOrder.map((severity) => {
        const group = findings.filter((finding) => finding.severity === severity)
        if (group.length === 0) return null
        const meta = severityMeta[severity]
        return (
          <section key={severity} aria-label={`${meta.label} findings`} className="flex flex-col">
            <StatusBadge tone={meta.tone}>
              {meta.label} · {group.length}
            </StatusBadge>
            <ul className="divide-y">
              {group.map((finding, index) => (
                <Finding key={`${finding.ruleId}-${finding.file ?? ""}-${finding.line ?? index}`} finding={finding} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
