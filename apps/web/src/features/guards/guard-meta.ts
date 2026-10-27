import type { GuardMode, GuardStatus } from "@pc/domain"
import type { Tone } from "@/components/status/tone"

interface ModeMeta {
  readonly label: string
  readonly description: string
  /** Blocking is the strongest outcome (danger), holding waits on a person (warning), monitoring only observes. */
  readonly tone: Tone
}

export const modeMeta: { readonly [M in GuardMode]: ModeMeta } = {
  enforce: { label: "Block", description: "Stop the call before it runs.", tone: "danger" },
  monitor: { label: "Monitor", description: "Let it run, and flag it in the audit log.", tone: "info" },
  require_approval: {
    label: "Hold for approval",
    description: "Pause the call until an approver says yes.",
    tone: "warning"
  }
}

export const statusMeta: { readonly [S in GuardStatus]: { readonly label: string; readonly tone: Tone } } = {
  active: { label: "Active", tone: "success" },
  draft: { label: "Draft", tone: "warning" },
  disabled: { label: "Switched off", tone: "neutral" }
}
