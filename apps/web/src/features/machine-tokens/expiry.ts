import type { MachineToken } from "@pc/domain"
import { DateTime } from "effect"
import { isPast } from "@/lib/format"

/** The CLI warns a week ahead; the dashboard asks for a renewal a week earlier, while there is time to plan it. */
export const renewSoonDays = 14

const dayMs = 86_400_000

export const isMachineTokenLive = (token: MachineToken) => token.revokedAt === null && !isPast(token.expiresAt)

export const daysLeft = (token: MachineToken) => Math.max(0, Math.ceil((DateTime.toEpochMillis(token.expiresAt) - Date.now()) / dayMs))

export const expiresSoon = (token: MachineToken) => isMachineTokenLive(token) && daysLeft(token) <= renewSoonDays
