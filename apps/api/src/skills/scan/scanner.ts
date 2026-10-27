import { type ScanFinding, type ScanReport, severityAtLeast, type SkillFileMode } from "@pc/domain"
import { Context, DateTime, Effect } from "effect"
import type { SkillMarkdown } from "../bundle/frontmatter"

/** One file as scanners see it; `text` is absent for binaries. */
export interface ScanFile {
  readonly path: string
  readonly mode: SkillFileMode
  readonly size: number
  readonly bytes: Uint8Array
  readonly text: string | undefined
}

/** A stored version, opened for scanning. */
export interface ScanInput {
  /** The folder the skill came from ("" for the root of its source); its name should match the frontmatter's. */
  readonly folder: string
  readonly skillMd: SkillMarkdown
  readonly files: ReadonlyArray<ScanFile>
}

/**
 * A pluggable scanner. It never fails: a scanner that cannot run reports `status: "error"`, which the
 * policy treats as "not scanned" rather than "passed".
 */
export interface SkillScanner {
  readonly id: string
  readonly version: string
  readonly scan: (input: ScanInput) => Effect.Effect<ScanReport>
}

/** The scanners that run on every version while scanning is on, in report order. */
export class SkillScanners extends Context.Service<SkillScanners, ReadonlyArray<SkillScanner>>()("api/skills/SkillScanners") {}

/** `flagged` when anything above `info` was found; the block decision is the org policy's, not the scanner's. */
export const reportOf = (scanner: SkillScanner, startedAt: DateTime.Utc, findings: ReadonlyArray<ScanFinding>): Effect.Effect<ScanReport> =>
  Effect.map(DateTime.now, (finishedAt) => ({
    scanner: scanner.id,
    status: findings.some((finding) => severityAtLeast(finding.severity, "low")) ? "flagged" : "passed",
    findings,
    toolVersion: scanner.version,
    startedAt,
    finishedAt
  }))

export const errorReport = (scanner: SkillScanner, startedAt: DateTime.Utc, message: string): Effect.Effect<ScanReport> =>
  Effect.map(DateTime.now, (finishedAt) => ({
    scanner: scanner.id,
    status: "error",
    findings: [{ scanner: scanner.id, ruleId: `${scanner.id}/unavailable`, severity: "info", title: "Scanner unavailable", detail: message }],
    toolVersion: scanner.version,
    startedAt,
    finishedAt
  }))
