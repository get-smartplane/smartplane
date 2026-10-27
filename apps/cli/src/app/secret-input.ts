import { Effect, Redacted, Stdio, Stream } from "effect"
import { Prompt } from "effect/cli"
import { failure, usageFailure } from "./failure"

/**
 * Secrets come from a hidden prompt, or from stdin when piped (`echo $KEY | smartplane ...`), never from argv,
 * where they would land in shell history and `ps`.
 */
export const readSecret = (message: string) =>
  Effect.gen(function*() {
    const stdio = yield* Stdio.Stdio
    const raw = (yield* stdio.stdinIsTerminal)
      ? Redacted.value(yield* Prompt.run(Prompt.Password({ message })))
      : yield* stdio.stdin.pipe(Stream.decodeText(), Stream.mkString)
    const value = raw.replace(/\r?\n$/, "")
    if (value.length === 0) return yield* usageFailure(`${message}: nothing was entered.`)
    return Redacted.make(value)
  })

/** Asks before something irreversible; refuses outright when nobody is at the keyboard to answer. */
export const confirm = (message: string, assumeYes: boolean) =>
  Effect.gen(function*() {
    if (assumeYes) return
    const stdio = yield* Stdio.Stdio
    if (!(yield* stdio.stdinIsTerminal)) return yield* usageFailure(`${message} Pass --yes to confirm non-interactively.`)
    if (!(yield* Prompt.run(Prompt.Confirm({ message, initial: false })))) return yield* failure("Cancelled.")
  })
