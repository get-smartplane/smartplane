import type { Principal, Resource, UploadSkillConfig } from "@pc/domain"
import { Effect, Layer } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { resolveAccess } from "../access/resolution"
import { SkillGateway } from "../mcp/skills/skill-gateway"
import { ResourceVisibility } from "../resources/resource-visibility"
import { ResourcesRepo } from "../resources/resources-repo"
import { extractArchive } from "../skills/archive/extract"
import { DefaultArchiveLimits } from "../skills/archive/limits"
import { makeBundle } from "../skills/bundle/bundle"
import { selectSkillRoot } from "../skills/bundle/root"
import { SkillIngest } from "../skills/ingest"
import { SkillScanQueue, type SkillScanMessage } from "../skills/scan/queue"
import { SkillScanRunner } from "../skills/scan/scan-runner"
import { SkillScanners, type SkillScanner } from "../skills/scan/scanner"
import { SkillContent } from "../skills/serving/content"
import { SkillVersions } from "../skills/versions"
import { now } from "./fixtures"
import { type Recorded, recordingAudit, resourceOf } from "./gateway-fakes"
import { seedOrg } from "./seed"
import { type Scanning, skillStorage } from "./skill-content"
import { grantOn } from "./skill-grants"

export const uploadedSkill: Resource = resourceOf("res_skillupld01", "PDF tools", {
  kind: "skill",
  source: "upload",
  description: "Fill PDFs"
} satisfies UploadSkillConfig)

/**
 * Every skill service over one migrated in-memory database and blob store, with the scanning flag set,
 * a recording audit log and queue, and the fixture user granted `read` on `uploadedSkill`.
 */
export const skillWorld = (options: {
  readonly scanning: Scanning
  readonly scanners?: ReadonlyArray<SkillScanner>
  readonly blobs?: Map<string, Uint8Array>
}) => {
  const events: Array<Recorded> = []
  const queued: Array<SkillScanMessage> = []
  const queue = Layer.succeed(SkillScanQueue, { send: (message) => Effect.sync(() => void queued.push(message)) })
  const policy = Layer.succeed(AccessPolicy, {
    resolve: (principal) => Effect.succeed(resolveAccess(principal, [grantOn(uploadedSkill, "read")], [uploadedSkill], now))
  })
  const base = Layer.mergeAll(ResourcesRepo.layer, recordingAudit(events), queue, policy, Layer.succeed(SkillScanners, options.scanners ?? [])).pipe(
    Layer.provideMerge(skillStorage(options.scanning, options.blobs))
  )
  const services = Layer.mergeAll(SkillIngest.layer, SkillScanRunner.layer, SkillVersions.layer, SkillGateway.layer.pipe(Layer.provideMerge(SkillContent.layer))).pipe(
    Layer.provideMerge(ResourceVisibility.layer),
    Layer.provideMerge(base)
  )
  const seeded = Layer.effectDiscard(Effect.gen(function*() {
    yield* seedOrg
    yield* ResourcesRepo.use((repo) => repo.insert(uploadedSkill)).pipe(Effect.orDie)
  }))
  return { events, queued, layer: Layer.provideMerge(seeded, services) }
}

/** Unpacks an archive and records it as the next version of `uploadedSkill`. */
export const uploadVersion = (principal: Principal, archive: Uint8Array) =>
  Effect.gen(function*() {
    const root = yield* selectSkillRoot(yield* extractArchive(archive, DefaultArchiveLimits), undefined)
    const bundle = yield* makeBundle(root)
    return yield* SkillIngest.use((ingest) => ingest.record(principal, uploadedSkill, bundle, { type: "upload", filename: "pdf.zip" }))
  })
