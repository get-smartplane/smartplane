import type { ChainedAuditEvent } from "@pc/domain"
import { Option, Schema } from "effect"

const Delivered = Schema.Struct({ name: Schema.String, purpose: Schema.Literals(["run", "boot"]), machineName: Schema.optionalKey(Schema.String) })
const Settings = Schema.Struct({ delivery: Schema.String, envName: Schema.NullOr(Schema.String) })
const Changed = Schema.Struct({ before: Settings, after: Settings })
const Decision = Schema.Struct({ action: Schema.Literal("secret.deliver"), name: Schema.String, purpose: Schema.optionalKey(Schema.String) })

const decodeDelivered = Schema.decodeUnknownOption(Delivered)
const decodeChanged = Schema.decodeUnknownOption(Changed)
const decodeDecision = Schema.decodeUnknownOption(Decision)

const purposes = { run: "smartplane run", boot: "service boot" } as const
const modes: Readonly<Record<string, string>> = { gateway_only: "Gateway only", deliverable: "Deliverable" }

/** A guard's `policy.denied` / `policy.flagged` on `POST /api/secrets/deliver` rather than on a tool call. */
export const isDeliveryDecision = (event: ChainedAuditEvent): boolean =>
  (event.type === "policy.denied" || event.type === "policy.flagged") && Option.isSome(decodeDecision(event.data))

const changeSummary = (data: unknown): string | undefined =>
  Option.match(decodeChanged(data), {
    onNone: () => undefined,
    onSome: ({ before, after }) => {
      const parts = [
        before.delivery !== after.delivery && `${modes[before.delivery] ?? before.delivery} → ${modes[after.delivery] ?? after.delivery}`,
        before.envName !== after.envName && `${before.envName ?? "none"} → ${after.envName ?? "none"}`
      ].filter((part): part is string => typeof part === "string")
      return parts.length === 0 ? after.envName ?? undefined : parts.join(" · ")
    }
  })

/** A one-line summary for delivery events (env name, purpose, what changed); undefined for every other event. */
export const deliverySummary = (event: ChainedAuditEvent): string | undefined => {
  if (event.type === "secret.delivered") {
    return Option.match(decodeDelivered(event.data), { onNone: () => undefined, onSome: (data) => `${data.name} · ${purposes[data.purpose]}` })
  }
  if (event.type === "secret.delivery_changed") return changeSummary(event.data)
  if (isDeliveryDecision(event)) return Option.getOrUndefined(Option.map(decodeDecision(event.data), (data) => data.name))
  return undefined
}
