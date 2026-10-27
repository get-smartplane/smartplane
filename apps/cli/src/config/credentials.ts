import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect"
import { HttpUrl } from "@pc/domain"
import { CliFailure, failure } from "../app/failure"
import { Host } from "../app/host"
import { configDir, credentialsPath } from "./paths"

/** A saved login. The token is kept in a 0600 file, like other CLIs' credential stores, and redacted in memory. */
export const Profile = Schema.Struct({
  apiUrl: HttpUrl,
  token: Schema.RedactedFromValue(Schema.String),
  org: Schema.optionalKey(Schema.String),
  identity: Schema.optionalKey(Schema.String),
  savedAt: Schema.String
})
export type Profile = typeof Profile.Type

export const CredentialsFile = Schema.Struct({
  version: Schema.Literal(1),
  profiles: Schema.Record(Schema.String, Profile)
})
export type CredentialsFile = typeof CredentialsFile.Type

const FileJson = Schema.fromJsonString(CredentialsFile)
const empty: CredentialsFile = { version: 1, profiles: {} }

/** Owner read/write only: the file holds bearer tokens. */
export const credentialsMode = 0o600

export class Credentials extends Context.Service<Credentials, {
  readonly path: string
  readonly profile: (name: string) => Effect.Effect<Option.Option<Profile>, CliFailure>
  readonly save: (name: string, profile: Profile) => Effect.Effect<void, CliFailure>
  readonly remove: (name: string) => Effect.Effect<boolean, CliFailure>
}>()("@pc/cli/Credentials") {
  static readonly layer = Layer.effect(
    Credentials,
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const host = yield* Host
      const path = credentialsPath(host)
      const unreadable = () => failure(`Cannot read ${path}.`, "Fix the file or delete it and log in again.")

      const load = Effect.gen(function*() {
        if (!(yield* fs.exists(path))) return empty
        return yield* Schema.decodeUnknownEffect(FileJson)(yield* fs.readFileString(path))
      }).pipe(Effect.mapError(unreadable))

      const store = (file: CredentialsFile) =>
        Effect.gen(function*() {
          yield* fs.makeDirectory(configDir(host), { recursive: true, mode: 0o700 })
          const text = yield* Schema.encodeEffect(FileJson)(file)
          // Write a private temp file, then rename, so a crash never leaves a half-written or world-readable file.
          const temp = `${path}.${process.pid}.tmp`
          yield* fs.writeFileString(temp, `${text}\n`, { mode: credentialsMode })
          yield* fs.chmod(temp, credentialsMode)
          yield* fs.rename(temp, path)
        }).pipe(Effect.mapError(() => failure(`Cannot write ${path}.`)))

      return Credentials.of({
        path,
        profile: Effect.fn("Credentials.profile")(function*(name: string) {
          const file = yield* load
          return Option.fromNullishOr(file.profiles[name])
        }),
        save: Effect.fn("Credentials.save")(function*(name: string, profile: Profile) {
          const file = yield* load
          yield* store({ ...file, profiles: { ...file.profiles, [name]: profile } })
        }),
        remove: Effect.fn("Credentials.remove")(function*(name: string) {
          const file = yield* load
          if (!(name in file.profiles)) return false
          const { [name]: _removed, ...profiles } = file.profiles
          yield* store({ ...file, profiles })
          return true
        })
      })
    })
  )
}
