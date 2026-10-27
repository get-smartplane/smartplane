import type { SkillScanning, SkillVersion } from "@pc/domain"
import { ShieldOff } from "lucide-react"
import { Section } from "@/components/layout/section"
import { QueryView } from "@/components/query/query-view"
import { StatusBadge } from "@/components/status/status-badge"
import { useCan } from "@/features/auth/me-context"
import { versionAtom } from "../atoms"
import { overridable, scannerName, scanStatusMeta, severityMeta } from "../versions/scan-status"
import { OverrideDialog } from "./override-dialog"
import { OverrideNote } from "./override-note"
import { RescanButton } from "./rescan-button"
import { ScanReportCard } from "./scan-report-card"

/** One muted line: scanning is experimental and off unless the deployment turns it on. */
export function ScanningDisabled() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <ShieldOff className="size-4 shrink-0" strokeWidth={1.75} />
      Security scanning is not enabled for this workspace.
    </p>
  )
}

const policyLine = ({ policy }: SkillScanning) =>
  `Blocks at ${severityMeta[policy.blockAt].label.toLowerCase()} and above${policy.requireScan ? "; unscanned versions are not served" : ""}.`

/** The selected version's verdict and each scanner's report, with the ways out of a blocked or failed scan. */
export function ScanSection({ version, scanning }: { readonly version: SkillVersion; readonly scanning: SkillScanning }) {
  const canManage = useCan("resources:manage")
  const status = scanStatusMeta[version.scanStatus]
  const stuck = version.scanStatus === "blocked" || version.scanStatus === "error"
  return (
    <Section
      title={`Security scan · version ${version.version}`}
      description={policyLine(scanning)}
      aside={
        canManage && (
          <>
            {stuck && <RescanButton version={version} />}
            {overridable.has(version.scanStatus) && version.override === null && <OverrideDialog version={version} />}
          </>
        )
      }
    >
      <div className="flex items-center gap-2 text-sm">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span className="text-muted-foreground">{scanning.scanners.length > 0 ? `Checked by ${scanning.scanners.map(scannerName).join(" and ")}` : "No scanners configured"}</span>
      </div>
      {version.override !== null && <OverrideNote override={version.override} />}
      <QueryView atom={versionAtom(version.resourceId)(version.version)}>
        {({ reports }) =>
          reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {version.scanStatus === "pending" ? "Scanning now. Reports appear here when each scanner finishes." : "No scan reports for this version."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {reports.map((report) => (
                <ScanReportCard key={report.scanner} report={report} />
              ))}
            </div>
          )
        }
      </QueryView>
    </Section>
  )
}
