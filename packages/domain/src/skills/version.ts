import { Schema } from "effect"
import { Sha256Hex } from "../audit/event"
import { OrgId, ResourceId, SkillVersionId, UserId } from "../ids"
import { PositiveInt, Timestamp } from "../primitives"
import { GithubRepo, GitRef, HttpsUrl, SkillFolder } from "./config"
import { ScanReport, ScanSummary, SkillScanStatus } from "./scan"

/** A file's path relative to the skill root, `/`-separated: no absolute paths, dot segments or backslashes. */
export const SkillFilePath = Schema.String.check(
  Schema.isMaxLength(512),
  Schema.isPattern(/^(?![/])(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)[^\\\u0000-\u001f]+$/)
).annotate({ identifier: "SkillFilePath" })

/** Only the executable bit survives from archives: scripts keep `755`, everything else is `644`. */
export const SkillFileMode = Schema.Literals(["644", "755"])
export type SkillFileMode = typeof SkillFileMode.Type

/** One entry of a version's manifest; the content is stored content-addressed by `sha256`. */
export const SkillFile = Schema.Struct({
  path: SkillFilePath,
  size: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sha256: Sha256Hex,
  mode: SkillFileMode
}).annotate({ identifier: "SkillFile" })
export type SkillFile = typeof SkillFile.Type

/** Exactly what a version was built from, so it can be audited and re-fetched. */
export const SkillSourceSnapshot = Schema.Union([
  Schema.Struct({ type: Schema.Literal("inline") }),
  Schema.Struct({
    type: Schema.Literal("github"),
    repo: GithubRepo,
    path: Schema.optionalKey(SkillFolder),
    ref: Schema.optionalKey(GitRef),
    /** The commit the ref resolved to when this version was fetched. */
    commit: Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/))
  }),
  Schema.Struct({ type: Schema.Literal("link"), url: HttpsUrl, path: Schema.optionalKey(SkillFolder) }),
  Schema.Struct({ type: Schema.Literal("upload"), filename: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(255))) })
]).annotate({ identifier: "SkillSourceSnapshot" })
export type SkillSourceSnapshot = typeof SkillSourceSnapshot.Type

/** Who let a blocked or unscanned version be served anyway, and why. */
export const ScanOverride = Schema.Struct({
  by: UserId,
  reason: Schema.String.check(Schema.isBetweenLength(1, 2000)),
  at: Timestamp
}).annotate({ identifier: "ScanOverride" })
export type ScanOverride = typeof ScanOverride.Type

/** An immutable snapshot of a skill folder. Only its scan verdict and override change after creation. */
export class SkillVersion extends Schema.Opaque<SkillVersion>()(
  Schema.Struct({
    id: SkillVersionId,
    orgId: OrgId,
    resourceId: ResourceId,
    version: PositiveInt,
    source: SkillSourceSnapshot,
    /** sha256 over the canonical file manifest: equal bundles have equal hashes. */
    contentHash: Sha256Hex,
    files: Schema.Array(SkillFile),
    name: Schema.String,
    description: Schema.String,
    scanStatus: SkillScanStatus,
    scanSummary: ScanSummary,
    override: Schema.NullOr(ScanOverride),
    /** Whether this is the version agents are served. */
    active: Schema.Boolean,
    createdBy: UserId,
    createdAt: Timestamp
  }).annotate({ identifier: "SkillVersion" })
) {}

export const SkillVersionDetail = Schema.Struct({
  version: SkillVersion,
  reports: Schema.Array(ScanReport),
  /** Whether agents can be served this version right now, under the policy and the scanning flag. */
  servable: Schema.Boolean
}).annotate({ identifier: "SkillVersionDetail" })
export type SkillVersionDetail = typeof SkillVersionDetail.Type

export const SkillUpdateCheck = Schema.Struct({
  ref: Schema.String,
  currentCommit: Schema.NullOr(Schema.String),
  latestCommit: Schema.String,
  updateAvailable: Schema.Boolean
}).annotate({ identifier: "SkillUpdateCheck" })
export type SkillUpdateCheck = typeof SkillUpdateCheck.Type
