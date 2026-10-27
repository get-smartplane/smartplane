import { Effect, FileSystem, Option, Path, Result } from "effect"
import type { CliFailure } from "../../app/failure"
import { Host } from "../../app/host"
import { type McpAuth, type McpClient } from "./clients"
import { type Merged, mergeServer } from "./merge"

export interface ConfigTarget {
  readonly local: boolean
  readonly file: Option.Option<string>
  readonly name: string
}

/** The client's config file (or `--file`) and what it holds now; `undefined` when it does not exist yet. */
export const readClientConfig = (client: McpClient, target: ConfigTarget) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const host = yield* Host
    const path = Option.getOrElse(target.file, () => client.path(host, target.local))
    const existing = (yield* fs.exists(path)) ? yield* fs.readFileString(path) : undefined
    const merge = (url: string, auth: McpAuth): Result.Result<Merged, CliFailure> =>
      mergeServer(existing, { path, serversKey: client.serversKey, name: target.name, entry: client.entry(url, auth) })
    return { path, existing, merge }
  })

export const writeClientConfig = (path: string, text: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory((yield* Path.Path).dirname(path), { recursive: true })
    yield* fs.writeFileString(path, text)
  })
