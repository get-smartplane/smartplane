import { Runtime, Schema } from "effect"

/** Process exit codes, part of the CLI's scripting contract. */
export const ExitCode = { ok: 0, error: 1, usage: 2, auth: 3 } as const
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode]

export const FailureKind = Schema.Literals(["error", "usage", "auth"])
export type FailureKind = typeof FailureKind.Type

/** Every failure the CLI reports: a one-line message, an optional next step, and the exit code it maps to. */
export class CliFailure extends Schema.TaggedError<CliFailure>()("CliFailure", {
  kind: FailureKind,
  message: Schema.String,
  hint: Schema.optionalKey(Schema.String)
}) {
  /** Read by the runtime's teardown, so `NodeRuntime.runMain` exits with the code scripts rely on. */
  get [Runtime.errorExitCode](): number {
    return ExitCode[this.kind]
  }

  /** The entry point prints failures itself; the runtime only logs defects. */
  readonly [Runtime.errorReported] = false
}

export const failure = (message: string, hint?: string) =>
  new CliFailure({ kind: "error", message, ...(hint === undefined ? {} : { hint }) })

export const usageFailure = (message: string, hint?: string) =>
  new CliFailure({ kind: "usage", message, ...(hint === undefined ? {} : { hint }) })

export const authFailure = (message: string, hint = "Run `smartplane login`, or set SMARTPLANE_TOKEN.") =>
  new CliFailure({ kind: "auth", message, hint })
