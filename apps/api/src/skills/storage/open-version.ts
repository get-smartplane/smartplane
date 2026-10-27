import type { SkillFile, SkillVersion } from "@pc/domain"
import { Effect, Option } from "effect"
import { parseSkillMarkdown, type SkillMarkdown } from "../bundle/frontmatter"
import { decodeText } from "../bundle/mime"
import { SkillMd } from "../bundle/root"
import type { ScanFile } from "../scan/scanner"
import { SkillBlobs } from "./blobs"

/** One manifest file's content. A missing blob means R2 and D1 disagree, which is a defect. */
export const readFile = (version: Pick<SkillVersion, "orgId">, file: SkillFile): Effect.Effect<Uint8Array, never, SkillBlobs> =>
  SkillBlobs.use((blobs) => blobs.get(version.orgId, file.sha256)).pipe(
    Effect.flatMap(Option.match({
      onNone: () => Effect.die(new Error(`skill blob ${file.sha256} is missing`)),
      onSome: Effect.succeed
    }))
  )

export interface OpenedVersion {
  readonly files: ReadonlyArray<ScanFile>
  readonly skillMd: SkillMarkdown
}

/** Every file of a version, read from R2, with text decoded where it is text. */
export const openVersion = (version: SkillVersion): Effect.Effect<OpenedVersion, never, SkillBlobs> =>
  Effect.gen(function*() {
    const files = yield* Effect.forEach(version.files, (file) =>
      Effect.map(readFile(version, file), (bytes): ScanFile => ({ path: file.path, mode: file.mode, size: file.size, bytes, text: decodeText(bytes) })), {
      concurrency: 8
    })
    const skillMd = files.find((file) => file.path === SkillMd)?.text ?? ""
    return { files, skillMd: parseSkillMarkdown(skillMd) }
  }).pipe(Effect.withSpan("skills.openVersion", { attributes: { "skill.version_id": version.id } }))
