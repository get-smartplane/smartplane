import { type Conflict, emptyScanSummary, type OrgId, type Principal, type Resource, type SkillSourceSnapshot, type SkillVersion } from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requireUser } from "../auth/permissions"
import { Ids } from "../platform/ids"
import { AppConfig, skillScanningEnabled } from "../platform/config"
import type { SkillBundle } from "./bundle/bundle"
import { SkillScanQueue } from "./scan/queue"
import { SkillBlobs } from "./storage/blobs"
import { SkillVersionsRepo } from "./storage/versions-repo"

/**
 * Turns a validated skill bundle (`makeBundle`) into the next version of a skill: files into R2 by hash,
 * the manifest into D1, a scan queued (or `skipped` while scanning is off). A skill's first version becomes
 * active right away; later ones wait to be activated. If the manifest cannot be stored, the blobs this call
 * created are deleted again unless some stored version lists them.
 */
export class SkillIngest extends Context.Service<SkillIngest, {
  readonly record: (principal: Principal, resource: Resource, bundle: SkillBundle, source: SkillSourceSnapshot) => Effect.Effect<SkillVersion, Conflict>
}>()("api/skills/SkillIngest") {
  static readonly layer = Layer.effect(
    SkillIngest,
    Effect.gen(function*() {
      const blobs = yield* SkillBlobs
      const versions = yield* SkillVersionsRepo
      const queue = yield* SkillScanQueue
      const audit = yield* AuditLog
      const scanning = skillScanningEnabled(yield* AppConfig)

      // Best effort: a concurrent ingest of the same bytes that has put but not yet inserted can still lose its
      // blob in this window; the usage check closes it for every version already stored.
      const discard = (orgId: OrgId, created: ReadonlyArray<string>) =>
        Effect.forEach(created, (sha256) => Effect.flatMap(versions.usesBlob(orgId, sha256), (used) => (used ? Effect.void : blobs.remove(orgId, sha256))), {
          discard: true
        })

      const record = Effect.fn("SkillIngest.record")(function*(principal: Principal, resource: Resource, bundle: SkillBundle, source: SkillSourceSnapshot) {
        const user = yield* Effect.orDie(requireUser(principal))
        const draft = {
          id: yield* Ids.skillVersion,
          orgId: resource.orgId,
          resourceId: resource.id,
          source,
          contentHash: bundle.contentHash,
          files: bundle.manifest,
          name: bundle.skillMd.name ?? "",
          description: bundle.skillMd.description ?? "",
          scanStatus: scanning ? "pending" as const : "skipped" as const,
          scanSummary: emptyScanSummary,
          override: null,
          createdBy: user.userId,
          createdAt: yield* DateTime.now
        }
        // Blobs before the manifest, so a stored version never lists a file R2 does not have.
        const created = new Set<string>()
        const put = (file: SkillBundle["files"][number]) =>
          Effect.map(blobs.put(resource.orgId, file.entry.sha256, file.bytes), (fresh) => void (fresh && created.add(file.entry.sha256)))
        const number = yield* Effect.forEach(bundle.files, put, { concurrency: 8, discard: true }).pipe(
          Effect.andThen(versions.insert(draft)),
          Effect.onError(() => discard(resource.orgId, Array.from(created)))
        )
        const version: SkillVersion = { ...draft, version: number, active: number === 1 }
        const target = { type: "resource" as const, id: resource.id }
        yield* audit.by(principal, "skill.version_created", target, {
          versionId: version.id,
          version: number,
          contentHash: version.contentHash,
          source: source.type,
          ...(source.type === "github" ? { commit: source.commit } : {}),
          files: version.files.length,
          scanStatus: version.scanStatus
        })
        if (scanning) yield* queue.send({ orgId: resource.orgId, versionId: version.id })
        if (version.active) {
          yield* versions.activate(version, user.userId)
          yield* audit.by(principal, "skill.activated", target, { versionId: version.id, version: number, contentHash: version.contentHash, first: true })
        }
        return version
      })

      return SkillIngest.of({ record })
    })
  )
}
