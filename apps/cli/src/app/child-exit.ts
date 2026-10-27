import { Runtime, Schema } from "effect"

/**
 * `smartplane run` exits with its child's status: the child's exit code, 128+n when a signal killed it, 126/127
 * when it could not be started. `detail` is set only when the CLI itself has something to say.
 */
export class ChildExit extends Schema.TaggedError<ChildExit>()("ChildExit", {
  code: Schema.Int,
  detail: Schema.optionalKey(Schema.String)
}) {
  get [Runtime.errorExitCode](): number {
    return this.code
  }

  readonly [Runtime.errorReported] = false
}
