import { Schema } from "effect"
import { GuardId, ResourceId } from "../ids"
import { Timestamp } from "../primitives"

/** The admin setup flow, in order: a tool, who may use it, a rule, the team, then an agent. */
export const SetupStep = Schema.Literals(["tool", "access", "rule", "team", "agent"]).annotate({ identifier: "SetupStep" })
export type SetupStep = typeof SetupStep.Type

export const SetupStepState = Schema.Literals(["todo", "done", "skipped"]).annotate({ identifier: "SetupStepState" })
export type SetupStepState = typeof SetupStepState.Type

/** `open` shows the "Finish setup" card; `completed` and `dismissed` both retire it. */
export const SetupStatus = Schema.Literals(["open", "completed", "dismissed"]).annotate({ identifier: "SetupStatus" })
export type SetupStatus = typeof SetupStatus.Type

export const SetupSteps = Schema.Struct({
  tool: SetupStepState,
  access: SetupStepState,
  rule: SetupStepState,
  team: SetupStepState,
  agent: SetupStepState
}).annotate({ identifier: "SetupSteps" })
export type SetupSteps = typeof SetupSteps.Type

/** An org's setup progress, saved on the server so it resumes on any device and for any admin. */
export class OrgSetup extends Schema.Opaque<OrgSetup>()(
  Schema.Struct({
    status: SetupStatus,
    steps: SetupSteps,
    /** The tool connected in the first step; later steps grant and guard it. */
    toolResourceId: Schema.NullOr(ResourceId),
    /** The rule added in the third step. */
    guardId: Schema.NullOr(GuardId),
    /** Null until someone first changes it. */
    updatedAt: Schema.NullOr(Timestamp)
  }).annotate({ identifier: "OrgSetup" })
) {}

export const initialSetupSteps: SetupSteps = { tool: "todo", access: "todo", rule: "todo", team: "todo", agent: "todo" }

/** A partial update: only the given step states and fields change. */
export const UpdateOrgSetup = Schema.Struct({
  status: Schema.optionalKey(SetupStatus),
  steps: Schema.optionalKey(Schema.Struct({
    tool: Schema.optionalKey(SetupStepState),
    access: Schema.optionalKey(SetupStepState),
    rule: Schema.optionalKey(SetupStepState),
    team: Schema.optionalKey(SetupStepState),
    agent: Schema.optionalKey(SetupStepState)
  })),
  toolResourceId: Schema.optionalKey(Schema.NullOr(ResourceId)),
  guardId: Schema.optionalKey(Schema.NullOr(GuardId))
}).annotate({ identifier: "UpdateOrgSetup" })
export type UpdateOrgSetup = typeof UpdateOrgSetup.Type

/** An invited member's first-sign-in welcome: shown while `pending`. */
export const WelcomeStatus = Schema.Literals(["pending", "completed", "dismissed"]).annotate({ identifier: "WelcomeStatus" })
export type WelcomeStatus = typeof WelcomeStatus.Type

export const MemberWelcome = Schema.Struct({
  status: WelcomeStatus,
  updatedAt: Schema.NullOr(Timestamp)
}).annotate({ identifier: "MemberWelcome" })
export type MemberWelcome = typeof MemberWelcome.Type

export const UpdateMemberWelcome = Schema.Struct({
  status: WelcomeStatus.pick(["completed", "dismissed"])
}).annotate({ identifier: "UpdateMemberWelcome" })
export type UpdateMemberWelcome = typeof UpdateMemberWelcome.Type

/** Everything the dashboard needs to decide what onboarding to show the caller. */
export const OnboardingProgress = Schema.Struct({
  /** Null when the caller may not run the org's setup (it needs `resources:manage`). */
  setup: Schema.NullOr(OrgSetup),
  welcome: MemberWelcome
}).annotate({ identifier: "OnboardingProgress" })
export type OnboardingProgress = typeof OnboardingProgress.Type

/** The org's setup before anyone has touched it. */
export const initialOrgSetup = (): OrgSetup =>
  OrgSetup.make({ status: "open", steps: initialSetupSteps, toolResourceId: null, guardId: null, updatedAt: null })
