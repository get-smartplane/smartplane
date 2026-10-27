import { NotFound, type Principal, type ResourceId } from "@pc/domain"
import { Context, Effect, Layer } from "effect"
import { AccessPolicy } from "../access/access-policy"
import { AuditLog } from "../audit/audit-log"
import { readableSkills } from "../mcp/skills/granted"
import { gzip } from "./archive/inflate"
import { writeTar } from "./archive/tar"
import { SkillContent } from "./serving/content"

export interface DownloadedBundle {
  readonly slug: string
  readonly contentHash: string
  /** A .tar.gz of the skill folder, paths relative to the skill root. */
  readonly archive: Uint8Array
}

/**
 * Skill folders for the CLI. Authorization is the MCP gateway's: a live `read` grant on the skill in the
 * caller's scope, and a servable version. Anything else is not found, never forbidden, so the endpoint does
 * not confirm that a skill exists. Downloads are audited like resource reads.
 */
export class SkillDownloads extends Context.Service<SkillDownloads, {
  readonly download: (principal: Principal, id: ResourceId) => Effect.Effect<DownloadedBundle, NotFound>
}>()("api/skills/SkillDownloads") {
  static readonly layer = Layer.effect(
    SkillDownloads,
    Effect.gen(function*() {
      const policy = yield* AccessPolicy
      const content = yield* SkillContent
      const audit = yield* AuditLog

      const download = Effect.fn("SkillDownloads.download")(function*(principal: Principal, id: ResourceId) {
        yield* Effect.annotateCurrentSpan({ "org.id": principal.orgId, "resource.id": id })
        const granted = readableSkills(yield* policy.resolve(principal)).filter((skill) => skill.resource.id === id)
        const [skill] = yield* content.serve(principal.orgId, granted)
        if (skill === undefined) return yield* new NotFound({ entity: "resource", id })
        const files = yield* Effect.forEach(skill.files, (file) => Effect.map(content.read(skill, file), (bytes) => ({ path: file.path, mode: file.mode, bytes })), {
          concurrency: 8
        })
        const archive = yield* gzip(writeTar(files))
        yield* audit.by(principal, "skill.downloaded", { type: "resource", id }, { version: skill.contentHash, files: files.length })
        const bundle: DownloadedBundle = { slug: skill.slug, contentHash: skill.contentHash, archive }
        return bundle
      })

      return SkillDownloads.of({ download })
    })
  )
}
