import type { OrgId, SkillVersion, SkillVersionId } from "@pc/domain"
import { Context, Effect, Layer, Option } from "effect"
import { AuditLog } from "../../audit/audit-log"
import { systemActor } from "../../audit/actor"
import { AppConfig, skillScanningEnabled } from "../../platform/config"
import { SkillBlobs } from "../storage/blobs"
import { openVersion } from "../storage/open-version"
import { SkillPolicyRepo } from "../storage/policy-repo"
import { SkillVersionsRepo } from "../storage/versions-repo"
import { SkillScanners } from "./scanner"
import { verdictOf } from "./verdict"

/**
 * Runs every scanner over a stored version, saves their reports and the policy's verdict, and audits the
 * outcome as `skill.scanned`. Only the verdict columns are written, and only if nobody overrode or
 * re-scanned the version while the scanners ran. With scanning off it does nothing: a message queued
 * before the flag was turned off is dropped.
 */
export class SkillScanRunner extends Context.Service<SkillScanRunner, {
  readonly scan: (orgId: OrgId, versionId: SkillVersionId) => Effect.Effect<Option.Option<SkillVersion>>
}>()("api/skills/SkillScanRunner") {
  static readonly layer = Layer.effect(
    SkillScanRunner,
    Effect.gen(function*() {
      const scanners = yield* SkillScanners
      const versions = yield* SkillVersionsRepo
      const policies = yield* SkillPolicyRepo
      const blobs = yield* SkillBlobs
      const audit = yield* AuditLog
      const enabled = skillScanningEnabled(yield* AppConfig)

      const scan = Effect.fn("SkillScanRunner.scan")(function*(orgId: OrgId, versionId: SkillVersionId) {
        yield* Effect.annotateCurrentSpan({ "org.id": orgId, "skill.version_id": versionId, "skill.scanning": enabled })
        if (!enabled) return Option.none()
        const found = yield* versions.findById(orgId, versionId)
        if (Option.isNone(found)) return Option.none()
        const version = found.value
        const opened = yield* Effect.provideService(openVersion(version), SkillBlobs, blobs)
        const input = { folder: folderOf(version), ...opened }
        const reports = yield* Effect.forEach(scanners, (scanner) => scanner.scan(input), { concurrency: "unbounded" })
        const verdict = verdictOf(reports, yield* policies.get(orgId))
        // Compare-and-set against the state read above: an override or re-scan meanwhile wins over this result.
        if (!(yield* versions.saveScan(version, verdict, reports))) {
          yield* Effect.annotateCurrentSpan({ "skill.scan_superseded": true })
          return Option.none()
        }
        const scanned: SkillVersion = { ...version, scanStatus: verdict.status, scanSummary: verdict.summary }
        yield* audit.record({
          orgId,
          type: "skill.scanned",
          actor: systemActor("skill-scanner"),
          target: { type: "resource", id: version.resourceId },
          data: { versionId, version: version.version, contentHash: version.contentHash, status: verdict.status, ...verdict.summary }
        })
        yield* Effect.annotateCurrentSpan({ "skill.scan_status": verdict.status })
        return Option.some(scanned)
      })

      return SkillScanRunner.of({ scan })
    })
  )
}

/** The folder a version came from, for the frontmatter-name check. */
const folderOf = (version: SkillVersion): string =>
  version.source.type === "github" || version.source.type === "link" ? version.source.path ?? "" : ""
