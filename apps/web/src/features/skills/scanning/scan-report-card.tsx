import type { ScanReport } from "@pc/domain"
import { DateTime } from "effect"
import { StatusBadge } from "@/components/status/status-badge"
import { formatDateTime, formatRelative } from "@/lib/format"
import { plural } from "../format"
import { reportStatusMeta, scannerName } from "../versions/scan-status"
import { FindingsList } from "./findings-list"

const duration = (report: ScanReport): string => {
  const ms = DateTime.toEpochMillis(report.finishedAt) - DateTime.toEpochMillis(report.startedAt)
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

/** One scanner's verdict: its status pill, then what it found, grouped by severity. */
export function ScanReportCard({ report }: { readonly report: ScanReport }) {
  const status = reportStatusMeta[report.status]
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">{scannerName(report.scanner)}</h3>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className="ml-auto text-xs text-muted-foreground" title={formatDateTime(report.finishedAt)}>
          {plural(report.findings.length, "finding")} · {duration(report)} · {formatRelative(report.finishedAt)} · <span className="font-mono">{report.toolVersion}</span>
        </span>
      </header>
      {report.status === "error" ? (
        <p className="text-sm text-muted-foreground">This scanner could not run, so the version counts as not scanned. Re-scan to try again.</p>
      ) : (
        <FindingsList findings={report.findings} />
      )}
    </article>
  )
}
