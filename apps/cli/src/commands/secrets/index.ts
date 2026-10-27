import { Effect, Redacted } from "effect"
import { Command, Flag } from "effect/cli"
import { usageFailure } from "../../app/failure"
import { out, note } from "../../app/output"
import { deliveryFlags, fetchDelivery } from "../../delivery/fetch"
import { deniedNotice } from "../../delivery/plan"
import { dotenv } from "./dotenv"

const plaintextWarning = "`secrets env` prints secret values in plaintext, where they end up in files, shell history and backups."
const plaintextHint = [
  "Prefer `smartplane run -- <command>`: values stay in memory and are scrubbed from the command's output.",
  "If you really need a file, pass --i-understand-this-writes-plaintext and redirect stdout yourself."
].join("\n")

const envCommand = Command.make("env", {
  ...deliveryFlags,
  format: Flag.Literals("format", ["dotenv", "json"]).pipe(Flag.withDescription("Output format"), Flag.withDefault("dotenv")),
  understood: Flag.Boolean("i-understand-this-writes-plaintext").pipe(
    Flag.withDescription("Required: confirms you know the values are printed in plaintext"),
    Flag.withDefault(false)
  )
}, (flags) =>
  Effect.gen(function*() {
    if (!flags.understood) return yield* usageFailure(plaintextWarning, plaintextHint)
    const plan = yield* fetchDelivery({ ...flags, purpose: "run", placeholders: false })
    if (plan.denied.length > 0) yield* note(deniedNotice(plan.denied))
    if (plan.denied.length > 0 && !flags.allowMissing) {
      return yield* usageFailure("Some requested names were not delivered.", "Pass --allow-missing to print the rest.")
    }
    const entries = plan.injected.map((item) => [item.name, Redacted.value(item.value)] as const)
    // Deliberately stdout only: the CLI never writes these values to a file itself.
    yield* out(flags.format === "json" ? JSON.stringify(Object.fromEntries(entries), null, 2) : dotenv(entries))
  })).pipe(
    Command.withDescription("Print your secrets and variables as dotenv or JSON (plaintext; needs an explicit flag)"),
    Command.withExamples([{
      command: "smartplane secrets env --format dotenv --i-understand-this-writes-plaintext > .env.local",
      description: "A local .env file; keep it out of version control"
    }])
  )

export const secrets = Command.make("secrets").pipe(
  Command.withDescription("Secret delivery outside `smartplane run`"),
  Command.withSubcommands([envCommand])
)
