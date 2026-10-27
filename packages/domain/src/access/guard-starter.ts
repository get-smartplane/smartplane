import { Schema } from "effect"
import { ProjectId, ResourceId } from "../ids"
import { Probability } from "../primitives"
import { GuardMode } from "./guard-intent"

/**
 * Rules Smartplane prepared by hand: written, compiled and tested against the real classifier ahead of time, so
 * choosing one (onboarding's suggestions) needs no verify run. The ids are the contract; the API holds each one's
 * wording, classifier question and examples.
 */
export const GuardStarterId = Schema.Literals([
  "github-protect-main",
  "github-no-repo-deletions",
  "linear-no-deleting-issues",
  "linear-no-customer-contacts",
  "slack-no-public-channels",
  "slack-no-channel-mentions",
  "drive-protect-finance-folder",
  "drive-no-public-sharing",
  "drive-keep-q3-reports",
  "notion-no-deleting-pages",
  "notion-hr-off-limits",
  "database-read-only",
  "database-no-personal-data",
  "database-no-bulk-exports",
  "no-deletions",
  "production-read-only",
  "keep-secrets-out"
]).annotate({ identifier: "GuardStarterId" })
export type GuardStarterId = typeof GuardStarterId.Type

/** A guard from a prepared rule: like `CreateGuard`, without the wording (the starter's) or approvers (none apply). */
export const CreateGuardFromStarter = Schema.Struct({
  starterId: GuardStarterId,
  /** Omit to take the mode the rule's wording suggests (`enforce` for every starter so far). */
  mode: Schema.optionalKey(GuardMode),
  threshold: Probability,
  projectId: Schema.NullOr(ProjectId),
  resourceIds: Schema.Array(ResourceId)
}).annotate({ identifier: "CreateGuardFromStarter" })
export type CreateGuardFromStarter = typeof CreateGuardFromStarter.Type
