import { Effect, FileSystem, Path } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

export interface EnvFile {
  readonly name: string
  readonly path: string
  /** Committed to git: its values are in the repository history, so they must be rotated, not just moved. */
  readonly tracked: boolean
}

/** `.env`, `.env.local`, `.env.<mode>`, ...; templates meant to be committed hold no real values. */
const isEnvFile = (name: string) => /^\.env(\..+)?$/.test(name) && !/\.(example|sample|template|dist|defaults)$/.test(name)

/** Local first: `.env.local` overrides `.env` in every framework that reads both. */
const precedence = (name: string) => (name === ".env" ? 0 : name.endsWith(".local") ? 2 : 1)

/** Which of `names` git tracks in `cwd`; none when git or a repository is missing. */
export const trackedByGit = (cwd: string, names: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const lines = yield* spawner.lines(ChildProcess.make("git", ["ls-files", "--", ...names], { cwd, stderr: "ignore" }))
    return new Set(lines.map((line) => line.trim()).filter((line) => line !== ""))
  }).pipe(Effect.orElseSucceed(() => new Set<string>()))

/** The dotenv files in `cwd`, in the order their values apply, each marked tracked or not. */
export const discoverEnvFiles = (cwd: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const names: Array<string> = []
    for (const name of yield* fs.readDirectory(cwd)) {
      if (isEnvFile(name) && (yield* fs.stat(path.join(cwd, name))).type === "File") names.push(name)
    }
    names.sort((a, b) => precedence(a) - precedence(b) || a.localeCompare(b))
    const tracked = names.length === 0 ? new Set<string>() : yield* trackedByGit(cwd, names)
    return names.map((name): EnvFile => ({ name, path: path.join(cwd, name), tracked: tracked.has(name) }))
  })
