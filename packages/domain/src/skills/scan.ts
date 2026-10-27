import { Schema } from "effect"
import { Timestamp } from "../primitives"

/** Ordered: each severity outranks the ones before it. */
export const ScanSeverity = Schema.Literals(["info", "low", "medium", "high", "critical"])
export type ScanSeverity = typeof ScanSeverity.Type

const severityRank: { readonly [S in ScanSeverity]: number } = { info: 0, low: 1, medium: 2, high: 3, critical: 4 }

export const severityAtLeast = (severity: ScanSeverity, threshold: ScanSeverity): boolean => severityRank[severity] >= severityRank[threshold]

export const maxSeverity = (severities: ReadonlyArray<ScanSeverity>): ScanSeverity | undefined =>
  severities.reduce<ScanSeverity | undefined>((max, next) => (max === undefined || severityRank[next] > severityRank[max] ? next : max), undefined)

/** One thing a scanner noticed, located in the bundle when it can be. */
export const ScanFinding = Schema.Struct({
  scanner: Schema.String,
  ruleId: Schema.String,
  severity: ScanSeverity,
  title: Schema.String,
  detail: Schema.String,
  file: Schema.optionalKey(Schema.String),
  line: Schema.optionalKey(Schema.Int)
}).annotate({ identifier: "ScanFinding" })
export type ScanFinding = typeof ScanFinding.Type

/** `failed`: the scanner judged the bundle unsafe outright. `error`: the scanner could not run. */
export const ScanReportStatus = Schema.Literals(["passed", "flagged", "failed", "error"])
export type ScanReportStatus = typeof ScanReportStatus.Type

/** What one scanner reported for one version. */
export const ScanReport = Schema.Struct({
  scanner: Schema.String,
  status: ScanReportStatus,
  findings: Schema.Array(ScanFinding),
  toolVersion: Schema.String,
  startedAt: Timestamp,
  finishedAt: Timestamp
}).annotate({ identifier: "ScanReport" })
export type ScanReport = typeof ScanReport.Type

/**
 * A version's verdict under the org's policy. `skipped`: scanning is turned off for the deployment, so the
 * version was never scanned and serving is not gated on it.
 */
export const SkillScanStatus = Schema.Literals(["pending", "passed", "flagged", "blocked", "error", "skipped"])
export type SkillScanStatus = typeof SkillScanStatus.Type

export const ScanSummary = Schema.Struct({
  findings: Schema.Int,
  maxSeverity: Schema.optionalKey(ScanSeverity),
  scanners: Schema.Array(Schema.Struct({ scanner: Schema.String, status: ScanReportStatus }))
}).annotate({ identifier: "ScanSummary" })
export type ScanSummary = typeof ScanSummary.Type

export const emptyScanSummary: ScanSummary = { findings: 0, scanners: [] }

/**
 * Org-level: versions with a finding at or above `blockAt` are blocked; with `requireScan`, a version is
 * served only once its scan finished (not pending, not errored).
 */
export const SkillScanPolicy = Schema.Struct({
  blockAt: ScanSeverity,
  requireScan: Schema.Boolean
}).annotate({ identifier: "SkillScanPolicy" })
export type SkillScanPolicy = typeof SkillScanPolicy.Type

export const defaultSkillScanPolicy: SkillScanPolicy = { blockAt: "high", requireScan: true }

/** Scanning is experimental and behind the `SKILL_SCANNING` deployment flag; `enabled: false` means off. */
export const SkillScanning = Schema.Struct({
  enabled: Schema.Boolean,
  scanners: Schema.Array(Schema.String),
  policy: SkillScanPolicy
}).annotate({ identifier: "SkillScanning" })
export type SkillScanning = typeof SkillScanning.Type
