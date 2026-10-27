import { Schema } from "effect"
import { ResourceId, UserId } from "../ids"
import { Probability, Timestamp } from "../primitives"

/**
 * How a resource came to be a target of a rule: the guard is scoped to it, the rule names it or its
 * product ("gh" for GitHub), or the compiler model read it from fuzzier wording.
 */
export const GuardTargetMatch = Schema.Literals(["scope", "name", "alias", "model"]).annotate({ identifier: "GuardTargetMatch" })
export type GuardTargetMatch = typeof GuardTargetMatch.Type

/**
 * Where the compiler's tool docs for a target came from: the server's (cached) live listing, the bundled
 * integration catalog, Smartplane's curated copy of the vendor's published tools, or nothing (only the
 * catalog description; connecting the account improves accuracy).
 */
export const GuardToolSource = Schema.Literals(["listing", "catalog", "curated", "none"]).annotate({ identifier: "GuardToolSource" })
export type GuardToolSource = typeof GuardToolSource.Type

export const GuardTarget = Schema.Struct({
  resourceId: ResourceId,
  name: Schema.String,
  /** The product it is, e.g. "Notion" for a resource named "Team wiki". */
  product: Schema.String,
  matched: GuardTargetMatch,
  /** The words of the rule that named it; empty for a scoped or model-read target. */
  mention: Schema.String,
  tools: GuardToolSource,
  toolCount: Schema.Int
}).annotate({ identifier: "GuardTarget" })
export type GuardTarget = typeof GuardTarget.Type

/** A product the rule names that the org has not added, so the rule cannot apply to it yet. */
export const GuardUnknownTarget = Schema.Struct({ mention: Schema.String, product: Schema.String }).annotate({ identifier: "GuardUnknownTarget" })
export type GuardUnknownTarget = typeof GuardUnknownTarget.Type

export const GuardGrounding = Schema.Struct({
  targets: Schema.Array(GuardTarget),
  unknown: Schema.Array(GuardUnknownTarget),
  /** Gateway tool names given to the compiler, most relevant first. */
  tools: Schema.Array(Schema.String)
}).annotate({ identifier: "GuardGrounding" })
export type GuardGrounding = typeof GuardGrounding.Type

/** An agent tool call as the gateway sees it, labelled with whether it breaks the rule. Never holds credentials. */
export const GuardToolCall = Schema.Struct({
  /** Gateway tool name, `<resource-slug>__<tool>`, e.g. `notion__notion-update-page`. */
  tool: Schema.NonEmptyString.check(Schema.isMaxLength(200)),
  resourceId: Schema.optionalKey(ResourceId),
  arguments: Schema.Json,
  violates: Schema.Boolean,
  /** What the call does, in a few words ("marks a to-do done"). */
  note: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200)))
}).annotate({ identifier: "GuardToolCall" })
export type GuardToolCall = typeof GuardToolCall.Type

/** A call someone added to a rule's test set by hand; it is re-run on every verify. */
export const GuardCustomCall = Schema.Struct({
  id: Schema.NonEmptyString.check(Schema.isMaxLength(40)),
  ...GuardToolCall.fields,
  addedBy: UserId,
  addedAt: Timestamp
}).annotate({ identifier: "GuardCustomCall" })
export type GuardCustomCall = typeof GuardCustomCall.Type

export const AddGuardTestCall = Schema.Struct({
  tool: GuardToolCall.fields.tool,
  resourceId: Schema.optionalKey(ResourceId),
  arguments: Schema.Json,
  violates: Schema.Boolean
}).annotate({ identifier: "AddGuardTestCall" })
export type AddGuardTestCall = typeof AddGuardTestCall.Type

/** `generated`: written by the example generator; `draft`: the compiled draft's own examples; `custom`: added by a person. */
export const GuardTestCallSource = Schema.Literals(["generated", "draft", "custom"]).annotate({ identifier: "GuardTestCallSource" })
export type GuardTestCallSource = typeof GuardTestCallSource.Type

/** One call run through the real call-time classifier: `violates` is what was expected, `triggered` what happened. */
export const GuardTestedCall = Schema.Struct({
  ...GuardToolCall.fields,
  source: GuardTestCallSource,
  probability: Probability,
  triggered: Schema.Boolean
}).annotate({ identifier: "GuardTestedCall" })
export type GuardTestedCall = typeof GuardTestedCall.Type

/** `running` while the background job tests the draft; absent on guards tested before it moved off the request. */
export const GuardSelfTestStatus = Schema.Literals(["running", "done", "failed"]).annotate({ identifier: "GuardSelfTestStatus" })
export type GuardSelfTestStatus = typeof GuardSelfTestStatus.Type

/** The background job recompiled the draft to fix its mistakes: the new version and what it replaced. */
export const GuardRecompile = Schema.Struct({
  fromVersion: Schema.Int,
  previousInstructions: Schema.String,
  /** Calls the previous draft misjudged, which the recompile was told about. */
  mistakes: Schema.Int
}).annotate({ identifier: "GuardRecompile" })
export type GuardRecompile = typeof GuardRecompile.Type

export const GuardSelfTest = Schema.Struct({
  status: Schema.optionalKey(GuardSelfTestStatus),
  /** Identifies the background run, so a stale run never overwrites a newer verify. */
  jobId: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(40))),
  startedAt: Schema.optionalKey(Timestamp),
  finishedAt: Schema.optionalKey(Timestamp),
  threshold: Probability,
  calls: Schema.Array(GuardTestedCall),
  /** A second draft was compiled with the first one's mistakes; the better of the two was kept. */
  retried: Schema.Boolean,
  recompiled: Schema.optionalKey(GuardRecompile),
  /** What went wrong or was skipped (example generation timed out, the classifier was down). Never secret. */
  note: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(300)))
}).annotate({ identifier: "GuardSelfTest" })
export type GuardSelfTest = typeof GuardSelfTest.Type
