import { Schema } from "effect"
import { ConnectionContext } from "../connections/account"
import { GuardId, OrgId, ProjectId, ResourceId, UserId } from "../ids"
import { Name, Probability, Timestamp } from "../primitives"
import { GuardApplies, GuardReferences } from "./guard-applies"
import { GuardCustomCall, GuardGrounding, GuardSelfTest } from "./guard-grounding"
import { GuardApprover, GuardMode, GuardSuggestion } from "./guard-intent"
import { GuardPin, GuardPinLookup } from "./guard-pins"
import { GuardStarterId } from "./guard-starter"
import { GuardVerifyRun } from "./guard-verify"

/** Compiling always resets a guard to `draft`: a human reviews the classifier prompt before activation. */
export const GuardStatus = Schema.Literals(["draft", "active", "disabled"])
export type GuardStatus = typeof GuardStatus.Type

/**
 * Kinds of change a rule governs on the thing it names, read by the compiler from the rule's wording
 * ("update the todo list" covers adding, editing and removing its items). Used by deterministic checks
 * that need to know the rule covers, say, creating items (see `pinning/create-in-pin.ts`).
 */
export const GuardOperation = Schema.Literals(["create", "update", "delete", "read"]).annotate({ identifier: "GuardOperation" })
export type GuardOperation = typeof GuardOperation.Type

export const GuardExample = Schema.Struct({
  action: Schema.NonEmptyString,
  violates: Schema.Boolean
}).annotate({ identifier: "GuardExample" })
export type GuardExample = typeof GuardExample.Type

/** Classifier instructions drafted from the plain-language rule. */
export const CompiledGuard = Schema.Struct({
  instructions: Schema.NonEmptyString,
  examples: Schema.Array(GuardExample),
  /** What the rule governs on its target; absent on drafts compiled before it existed (then nothing is assumed). */
  operations: Schema.optionalKey(Schema.Array(GuardOperation)),
  /** Mode and approvers read from the rule's wording. Absent on guards compiled before suggestions existed. */
  suggestion: Schema.optionalKey(GuardSuggestion),
  /** Which of the org's resources the rule names, and which of their real tools the compiler was shown. */
  grounding: Schema.optionalKey(GuardGrounding),
  /** The draft run through the call-time classifier on example tool calls before anyone activates it. */
  selfTest: Schema.optionalKey(GuardSelfTest),
  /** The specific thing the rule names, looked up in the integration for an admin to confirm as a pin. */
  pinning: Schema.optionalKey(GuardPinLookup),
  /** Listed gateway tools the draft says can break the rule, as the compiler model named them. */
  tools: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMaxLength(200))).check(Schema.isMaxLength(50))),
  /** Which calls verify found the rule is about, for an admin to accept as `Guard.applies`; absent: every call. */
  applies: Schema.optionalKey(GuardApplies),
  /** Which personal identities the rule needs the classifier to see. */
  references: Schema.optionalKey(GuardReferences),
  /** Set when this is a prepared rule's hand-written check (`GuardStarterId`); a rule edit drops it with the draft. */
  starter: Schema.optionalKey(GuardStarterId)
}).annotate({ identifier: "CompiledGuard" })
export type CompiledGuard = typeof CompiledGuard.Type

export class Guard extends Schema.Opaque<Guard>()(
  Schema.Struct({
    id: GuardId,
    orgId: OrgId,
    projectId: Schema.NullOr(ProjectId),
    /** Empty means the guard applies to every resource in its scope. */
    resourceIds: Schema.Array(ResourceId),
    name: Name,
    /** True until someone names the guard: editing the rule then renames it (see `nameFromRule`). */
    nameFollowsRule: Schema.Boolean,
    rule: Schema.NonEmptyString,
    mode: GuardMode,
    /**
     * True for a rule added without choosing a mode (quick add): each verify sets the mode and approvers its
     * wording suggests, while the rule is a draft. Choosing a mode or approvers by hand ends it.
     */
    modeFollowsRule: Schema.Boolean,
    /** Who may release held actions in `require_approval` mode; empty means anyone with `approvals:decide`. */
    approvers: Schema.Array(GuardApprover),
    /** Violation probability at or above which the guard triggers. */
    threshold: Probability,
    status: GuardStatus,
    compiled: Schema.NullOr(CompiledGuard),
    compiledVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    /** Calls people added to the rule's test set; every verify runs them again. */
    testCalls: Schema.Array(GuardCustomCall),
    /** Confirmed things inside integrations the rule names (see `GuardPin`). */
    pins: Schema.Array(GuardPin),
    /**
     * The calls the guard is checked on, as an admin accepted it from verify's suggestion (or edited it); null:
     * every call in its resource scope. Dropped when the rule changes.
     */
    applies: Schema.NullOr(GuardApplies),
    /** The latest verify run, while it runs and after; null before the first verify. */
    verify: Schema.NullOr(GuardVerifyRun),
    createdBy: UserId,
    createdAt: Timestamp,
    updatedAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "Guard" })
) {}

const RuleText = Schema.NonEmptyString.check(Schema.isMaxLength(4000))

/**
 * Omit `name` to have it follow the rule. A `name` equal to `nameFromRule(rule)` also follows the rule,
 * so older clients that always sent the derived name keep working. Omit `mode` to have verify set the mode
 * (and approvers) the rule's wording suggests; until then it is `enforce`, and it is never activated.
 */
export const CreateGuard = Schema.Struct({
  name: Schema.optionalKey(Name),
  rule: RuleText,
  mode: Schema.optionalKey(GuardMode),
  threshold: Probability,
  projectId: Schema.NullOr(ProjectId),
  resourceIds: Schema.Array(ResourceId),
  approvers: Schema.optionalKey(Schema.Array(GuardApprover))
}).annotate({ identifier: "CreateGuard" })
export type CreateGuard = typeof CreateGuard.Type

/**
 * Activating an uncompiled guard is a Conflict. Changing `rule` drops the compiled prompt and returns the
 * guard to draft (the old prompt describes the old rule), and renames it unless it was named by hand.
 * Setting `name` names it by hand; setting it to `nameFromRule(rule)` makes it follow the rule again.
 */
export const UpdateGuard = Schema.Struct({
  status: Schema.optionalKey(GuardStatus.pick(["active", "disabled"])),
  mode: Schema.optionalKey(GuardMode),
  threshold: Schema.optionalKey(Probability),
  name: Schema.optionalKey(Name),
  rule: Schema.optionalKey(RuleText),
  approvers: Schema.optionalKey(Schema.Array(GuardApprover)),
  /** Scope the guard to these resources (empty: every resource), e.g. the ones verify found the rule names. */
  resourceIds: Schema.optionalKey(Schema.Array(ResourceId)),
  /** Accept (or edit) the calls it is checked on, usually verify's suggestion; null clears it: every call. */
  applies: Schema.optionalKey(Schema.NullOr(GuardApplies))
}).annotate({ identifier: "UpdateGuard" })
export type UpdateGuard = typeof UpdateGuard.Type

/** A sample agent action for dry-running a compiled guard. */
export const GuardTestCase = Schema.Struct({
  tool: Schema.NonEmptyString,
  arguments: Schema.Unknown,
  actor: Schema.Struct({ role: Schema.String, teams: Schema.Array(Schema.String) }),
  /** The account the sample call goes through, to test rules about shared or per-user accounts. */
  connection: Schema.optionalKey(ConnectionContext)
}).annotate({ identifier: "GuardTestCase" })
export type GuardTestCase = typeof GuardTestCase.Type

export const GuardTestResult = Schema.Struct({
  probability: Probability,
  threshold: Probability,
  violates: Schema.Boolean
}).annotate({ identifier: "GuardTestResult" })
export type GuardTestResult = typeof GuardTestResult.Type
