import type { SkillScanning, SkillVersion } from "@pc/domain"
import type { Tone } from "@/components/status/tone"
import { scanStatusMeta } from "./scan-status"
import { isServable } from "./servable"

export interface ActiveStatus {
  readonly label: string
  readonly tone: Tone
}

/** Whether agents get this skill right now, and which version: the one question an admin asks first. */
export const activeStatus = (versions: ReadonlyArray<SkillVersion>, scanning: SkillScanning | undefined): ActiveStatus => {
  const active = versions.find((version) => version.active)
  if (active === undefined) return { label: "No active version", tone: "warning" }
  if (scanning !== undefined && !isServable(active, scanning)) {
    return { label: `v${active.version} not served · ${scanStatusMeta[active.scanStatus].label.toLowerCase()}`, tone: "danger" }
  }
  return { label: `Serving v${active.version}`, tone: "success" }
}
