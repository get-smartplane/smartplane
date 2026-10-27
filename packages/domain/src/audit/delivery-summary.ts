import { Schema } from "effect"
import { ResourceId } from "../ids"
import { Timestamp } from "../primitives"
import { Actor } from "./actor"

/**
 * How often a secret or variable was delivered (`secret.delivered` events still in the audit log, i.e.
 * within retention) and who received it last. One row per resource that was ever delivered.
 */
export class DeliverySummary extends Schema.Opaque<DeliverySummary>()(
  Schema.Struct({
    resourceId: ResourceId,
    count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
    lastDeliveredAt: Timestamp,
    /** A member, or a machine token as the system actor `machine_token:<id>`. */
    lastActor: Actor
  }).annotate({ identifier: "DeliverySummary" })
) {}
