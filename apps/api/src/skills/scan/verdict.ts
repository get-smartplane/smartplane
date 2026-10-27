import { maxSeverity, type ScanReport, type ScanSummary, severityAtLeast, type SkillScanPolicy, type SkillScanStatus, type SkillVersion } from "@pc/domain"

export interface Verdict {
  readonly status: SkillScanStatus
  readonly summary: ScanSummary
}

/**
 * A version's status under the org's policy: blocked at or above `blockAt` (or when a scanner failed it
 * outright), `error` if any scanner could not run, `flagged` for lesser findings, else `passed`.
 */
export const verdictOf = (reports: ReadonlyArray<ScanReport>, policy: SkillScanPolicy): Verdict => {
  const findings = reports.flatMap((report) => report.findings)
  const reported = findings.filter((finding) => severityAtLeast(finding.severity, "low"))
  const highest = maxSeverity(reported.map((finding) => finding.severity))
  const summary: ScanSummary = {
    findings: reported.length,
    ...(highest === undefined ? {} : { maxSeverity: highest }),
    scanners: reports.map(({ scanner, status }) => ({ scanner, status }))
  }
  const blocked = reports.some((report) => report.status === "failed") || (highest !== undefined && severityAtLeast(highest, policy.blockAt))
  const status: SkillScanStatus = blocked
    ? "blocked"
    : reports.some((report) => report.status === "error")
    ? "error"
    : reported.length > 0
    ? "flagged"
    : "passed"
  return { status, summary }
}

/**
 * Whether agents may be served a version. An override (a person's audited decision) always wins and
 * `blocked` never serves without one, whatever the `SKILL_SCANNING` flag says: turning the flag off for an
 * outage or rollback must not release what a scan already refused. With the flag off nothing else is
 * gated, so versions stored meanwhile (`skipped`) serve. With it on, a version that was not scanned
 * (pending, errored, or skipped while scanning was off) serves only if the policy does not require a scan.
 */
export const isServable = (version: Pick<SkillVersion, "scanStatus" | "override">, policy: SkillScanPolicy, scanning: boolean): boolean => {
  if (version.override !== null) return true
  if (version.scanStatus === "blocked") return false
  if (!scanning) return true
  switch (version.scanStatus) {
    case "passed":
    case "flagged":
      return true
    case "pending":
    case "error":
    case "skipped":
      return !policy.requireScan
  }
}
