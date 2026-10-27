import { Effect, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { ChildExit } from "../../app/child-exit"
import { usageFailure } from "../../app/failure"
import { Host } from "../../app/host"
import { emit, note } from "../../app/output"
import { table } from "../../app/table"
import { deliveryFlags, fetchDelivery } from "../../delivery/fetch"
import { deniedNotice, mergeEnvironment } from "../../delivery/plan"
import { DeliveryDenial, DeliveryPurpose } from "../../delivery/schema"
import { ChildRunner } from "../../run/runner"
import { minScrubLength, scrubPatterns } from "../../scrub/patterns"

/** What `--dry-run` shows: names and kinds only. Values are never printed, not even with `--json`. */
const DryRun = Schema.Struct({
  inject: Schema.Array(Schema.Struct({ name: Schema.String, kind: Schema.String })),
  denied: Schema.Array(DeliveryDenial),
  notScrubbed: Schema.Array(Schema.String)
})

const renderDryRun = (report: typeof DryRun.Type) =>
  report.inject.length === 0 ? "Nothing would be injected." : table(["name", "kind"], report.inject.map((item) => [item.name, item.kind]))

export const run = Command.make("run", {
  ...deliveryFlags,
  purpose: Flag.Literals("purpose", DeliveryPurpose.literals).pipe(
    Flag.withDescription("run for commands you start; boot for a service's start command (Railway, Fly, ...)"),
    Flag.withDefault("run")
  ),
  placeholders: Flag.Boolean("placeholders").pipe(
    Flag.withDescription("Set each denied name to smartplane:denied:NAME (with --allow-missing)"),
    Flag.withDefault(false)
  ),
  noScrub: Flag.Boolean("no-scrub").pipe(
    Flag.withDescription("Give the command this terminal directly; secrets are then not scrubbed from its output"),
    Flag.withDefault(false)
  ),
  dryRun: Flag.Boolean("dry-run").pipe(Flag.withDescription("List the names that would be injected, then stop"), Flag.withDefault(false)),
  command: Argument.String("command").pipe(Argument.withDescription("The command to run, after --"), Argument.variadic())
}, (flags) =>
  Effect.gen(function*() {
    const [command, ...args] = flags.command
    if (command === undefined && !flags.dryRun) {
      return yield* usageFailure("Nothing to run.", "Put the command after --, e.g. smartplane run -- node server.js")
    }
    const plan = yield* fetchDelivery(flags)
    const { patterns, skipped } = scrubPatterns(plan.secrets)
    if (plan.denied.length > 0) yield* note(deniedNotice(plan.denied))
    if (flags.dryRun) {
      const inject = plan.injected.map((item) => ({ name: item.name, kind: item.kind }))
      yield* emit(DryRun, { inject, denied: plan.denied, notScrubbed: flags.noScrub ? plan.secrets.map((s) => s.name) : skipped }, renderDryRun)
    }
    if (plan.denied.length > 0 && !flags.allowMissing) {
      return yield* usageFailure("Some requested names were not delivered.", "Pass --allow-missing to run anyway.")
    }
    if (flags.dryRun || command === undefined) return

    const { env, overridden } = mergeEnvironment((yield* Host).environment(), plan.injected)
    if (overridden.length > 0) yield* note(`smartplane: overriding variables already set: ${overridden.join(", ")}`)
    if (!flags.noScrub && skipped.length > 0) {
      yield* note(`smartplane: not scrubbed from output (shorter than ${minScrubLength} characters): ${skipped.join(", ")}`)
    }
    const code = yield* (yield* ChildRunner).run({ command, args, env, scrub: flags.noScrub ? [] : patterns })
    if (code !== 0) return yield* new ChildExit({ code })
  })).pipe(
    Command.withDescription("Run a command with your secrets and variables in its environment"),
    Command.withExamples([
      { command: "smartplane run -- npm test", description: "Inject everything you may use; scrub secrets from the output" },
      { command: "smartplane run --only STRIPE_KEY,DATABASE_URL -- node server.js", description: "Only these names" },
      { command: "smartplane run --purpose boot -- node server.js", description: "A service's start command (Railway, with a pcm_ machine token)" },
      { command: "smartplane run --no-scrub -- psql", description: "An interactive program that needs the terminal" }
    ])
  )
