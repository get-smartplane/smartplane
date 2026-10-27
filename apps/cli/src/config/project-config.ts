import { HttpUrl, ProjectId } from "@pc/domain"
import { Effect, FileSystem, Option, Path, Schema } from "effect"
import { failure } from "../app/failure"
import { Host } from "../app/host"
import { projectRoot } from "../skills/disk"

/**
 * `.smartplane/project.json` at the repository root: which Smartplane project this checkout belongs to.
 * It holds ids only, never a token or a value, so it is safe to commit.
 */
export const ProjectConfig = Schema.Struct({
  projectId: ProjectId,
  /** Set when the project lives on another Smartplane than the hosted one (self-hosted, local). */
  apiUrl: Schema.optionalKey(HttpUrl)
})
export type ProjectConfig = typeof ProjectConfig.Type

const ProjectConfigJson = Schema.fromJsonString(ProjectConfig)

export const projectConfigFile = (path: Path.Path, root: string) => path.join(root, ".smartplane", "project.json")

/** The project file of the repository the CLI runs in, if there is one. A malformed file is an error, not ignored. */
export const readProjectConfig = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const file = projectConfigFile(yield* Path.Path, yield* projectRoot((yield* Host).cwd))
  if (!(yield* fs.exists(file))) return Option.none<ProjectConfig>()
  const text = yield* fs.readFileString(file).pipe(Effect.mapError(() => failure(`Cannot read ${file}.`)))
  return Option.some(yield* Schema.decodeUnknownEffect(ProjectConfigJson)(text).pipe(
    Effect.mapError(() => failure(`${file} is not a Smartplane project file.`, "Fix it, delete it, or run `smartplane init` again."))
  ))
})

export const renderProjectConfig = (config: ProjectConfig): string =>
  `${JSON.stringify({ projectId: config.projectId, ...(config.apiUrl === undefined ? {} : { apiUrl: config.apiUrl }) }, null, 2)}\n`

export const writeProjectConfig = (config: ProjectConfig) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const file = projectConfigFile(path, yield* projectRoot((yield* Host).cwd))
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    yield* fs.writeFileString(file, renderProjectConfig(config))
    return file
  })
