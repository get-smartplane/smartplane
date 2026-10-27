import { Console, Context, Effect, Layer, Schema } from "effect"
import { JsonOutput } from "./settings"

/** Results go to stdout; progress, notes and warnings to stderr, so `--json` and pipes stay clean. */
export class Output extends Context.Service<Output, {
  readonly out: (text: string) => Effect.Effect<void>
  readonly note: (text: string) => Effect.Effect<void>
}>()("@pc/cli/Output") {
  static readonly layer = Layer.succeed(Output, Output.of({ out: (text) => Console.log(text), note: (text) => Console.error(text) }))

  /** Collects lines in memory for tests. */
  static readonly layerMemory = (stdout: Array<string>, stderr: Array<string> = []) =>
    Layer.succeed(Output, Output.of({
      out: (text) => Effect.sync(() => void stdout.push(text)),
      note: (text) => Effect.sync(() => void stderr.push(text))
    }))
}

export const out = (text: string) => Output.use((output) => output.out(text))
export const note = (text: string) => Output.use((output) => output.note(text))

/** Encodes with the domain schema (ISO timestamps, tagged unions) so `--json` matches the HTTP API's JSON. */
export const toJson = <S extends Schema.Top>(schema: S, value: S["Type"]) =>
  Schema.encodeUnknownEffect(Schema.toCodecJson(schema))(value).pipe(Effect.orDie)

/** Prints `value` as JSON under `--json`, otherwise as the human rendering (which may look up names first). */
export const emitWith = <S extends Schema.Top, R>(schema: S, value: S["Type"], human: (value: S["Type"]) => Effect.Effect<string, never, R>) =>
  Effect.gen(function*() {
    if (yield* JsonOutput) return yield* out(JSON.stringify(yield* toJson(schema, value), null, 2))
    yield* out(yield* human(value))
  })

export const emit = <S extends Schema.Top>(schema: S, value: S["Type"], human: (value: S["Type"]) => string) =>
  emitWith(schema, value, (v) => Effect.succeed(human(v)))
