import type { GuardStarterId } from "@pc/domain"
import { chatStarters } from "./catalog-chat"
import { codeStarters } from "./catalog-code"
import { databaseStarters } from "./catalog-database"
import { driveStarters } from "./catalog-drive"
import { generalStarters } from "./catalog-general"
import type { Starter } from "./starter"

export const starters: ReadonlyArray<Starter> = [...codeStarters, ...chatStarters, ...driveStarters, ...databaseStarters, ...generalStarters]

const byId = new Map<GuardStarterId, Starter>(starters.map((starter) => [starter.id, starter]))

export const starterFor = (id: GuardStarterId): Starter | undefined => byId.get(id)
