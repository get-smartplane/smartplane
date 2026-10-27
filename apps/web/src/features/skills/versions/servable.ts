import type { SkillScanning, SkillVersion } from "@pc/domain"

/**
 * Mirrors the API's `isServable` (apps/api/src/skills/scan/verdict.ts) so the list can offer Activate without
 * one request per version; the API checks again and refuses anything this gets wrong. Blocked never serves
 * without an override, even with scanning turned off.
 */
export const isServable = (version: Pick<SkillVersion, "scanStatus" | "override">, scanning: SkillScanning): boolean => {
  if (version.override !== null) return true
  if (version.scanStatus === "blocked") return false
  if (!scanning.enabled) return true
  switch (version.scanStatus) {
    case "passed":
    case "flagged":
      return true
    case "pending":
    case "error":
    case "skipped":
      return !scanning.policy.requireScan
  }
}
