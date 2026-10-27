import { Schema } from "effect"
import { ResourceId, UserId } from "../ids"
import { Timestamp } from "../primitives"

const EntityId = Schema.NonEmptyString.check(Schema.isMaxLength(300))
const Label = Schema.NonEmptyString.check(Schema.isMaxLength(200))
const Kind = Schema.String.check(Schema.isMaxLength(60))
const Url = Schema.String.check(Schema.isMaxLength(1000))

/** A specific thing inside an integration that a rule names ("the Todo database"), as a lookup found it. */
export const GuardPinCandidate = Schema.Struct({
  resourceId: ResourceId,
  /** The upstream's own id for it, e.g. a Notion database id. */
  entityId: EntityId,
  label: Label,
  /** What it is, as the upstream says: "database", "page", "channel", "repository". */
  kind: Kind,
  url: Schema.optionalKey(Url)
}).annotate({ identifier: "GuardPinCandidate" })
export type GuardPinCandidate = typeof GuardPinCandidate.Type

/**
 * A candidate an admin confirmed. Calls whose arguments carry its id (or the id of an item seen inside it)
 * are told to the classifier as touching it. Only ids are kept, never the thing's content.
 */
export const GuardPin = Schema.Struct({
  id: Schema.NonEmptyString.check(Schema.isMaxLength(40)),
  ...GuardPinCandidate.fields,
  pinnedBy: UserId,
  pinnedAt: Timestamp,
  /** The last check could not find it any more (deleted, or the account lost access). */
  missing: Schema.optionalKey(Schema.Boolean),
  checkedAt: Schema.optionalKey(Timestamp)
}).annotate({ identifier: "GuardPin" })
export type GuardPin = typeof GuardPin.Type

/**
 * What verify's entity lookup found. `found`: candidates for the admin to confirm (nothing is pinned until
 * they do). The rest say why the rule stays semantic: it names no specific thing, no read tool can look it
 * up, the verifying admin has no connection or grant to look with, the lookup found nothing or failed, or the
 * admin said none of the candidates is it.
 */
export const GuardPinLookupStatus = Schema.Literals(["found", "not_specific", "no_lookup_tool", "no_connection", "none_found", "failed", "dismissed"])
  .annotate({ identifier: "GuardPinLookupStatus" })
export type GuardPinLookupStatus = typeof GuardPinLookupStatus.Type

export const GuardPinLookup = Schema.Struct({
  status: GuardPinLookupStatus,
  /** The rule's words for the thing, e.g. "todo list". */
  mention: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
  resourceId: Schema.optionalKey(ResourceId),
  /** The read-only gateway tool the lookup ran. */
  tool: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
  candidates: Schema.Array(GuardPinCandidate),
  detail: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(500)))
}).annotate({ identifier: "GuardPinLookup" })
export type GuardPinLookup = typeof GuardPinLookup.Type

/** Confirms one of the lookup's candidates as the thing the rule names. */
export const ConfirmGuardPin = Schema.Struct({ resourceId: ResourceId, entityId: EntityId }).annotate({ identifier: "ConfirmGuardPin" })
export type ConfirmGuardPin = typeof ConfirmGuardPin.Type

/** How many items the gateway has recognised inside a pin (rows of a database, issues of a project). */
export const GuardPinStats = Schema.Struct({ pinId: Schema.String, children: Schema.Int }).annotate({ identifier: "GuardPinStats" })
export type GuardPinStats = typeof GuardPinStats.Type
