import type { ScanReportStatus, ScanSeverity, SkillScanStatus } from "@pc/domain"
import type { Tone } from "@/components/status/tone"

interface StatusMeta {
  readonly label: string
  readonly tone: Tone
}

/** A version's verdict. `error` reads as "not scanned", never as passed. */
export const scanStatusMeta: { readonly [S in SkillScanStatus]: StatusMeta } = {
  pending: { label: "Scanning", tone: "info" },
  passed: { label: "Passed", tone: "success" },
  flagged: { label: "Flagged", tone: "warning" },
  blocked: { label: "Blocked", tone: "danger" },
  error: { label: "Scan failed", tone: "danger" },
  skipped: { label: "Not scanned", tone: "neutral" }
}

/** One scanner's report. */
export const reportStatusMeta: { readonly [S in ScanReportStatus]: StatusMeta } = {
  passed: { label: "Passed", tone: "success" },
  flagged: { label: "Findings", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
  error: { label: "Could not run", tone: "danger" }
}

export const severityMeta: { readonly [S in ScanSeverity]: StatusMeta } = {
  critical: { label: "Critical", tone: "danger" },
  high: { label: "High", tone: "danger" },
  medium: { label: "Medium", tone: "warning" },
  low: { label: "Low", tone: "info" },
  info: { label: "Info", tone: "neutral" }
}

/** Most severe first, the order findings are read in. */
export const severityOrder: ReadonlyArray<ScanSeverity> = ["critical", "high", "medium", "low", "info"]

const scannerNames: Readonly<Record<string, string>> = { builtin: "Built-in rules", clef: "Clef classifier" }

export const scannerName = (scanner: string): string => scannerNames[scanner] ?? scanner

/** Statuses a person may override so the version can be served anyway; the API refuses the rest (a pending scan has no verdict to override yet). */
export const overridable: ReadonlySet<SkillScanStatus> = new Set(["blocked", "error"])
