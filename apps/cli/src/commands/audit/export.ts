import { DateTime, Effect, Option } from "effect"
import { Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { usageFailure } from "../../app/failure"
import { parseMoment } from "../../app/flag-values"
import { out } from "../../app/output"

const moment = (name: string, text: string, now: DateTime.Utc) =>
  Option.match(parseMoment(text, now, "ago"), {
    onNone: () => Effect.fail(usageFailure(`Cannot read --${name} "${text}".`, "Use 2026-07-01, 2026-07-01T00:00:00Z or 7d (ago).")),
    onSome: Effect.succeed
  })

export const exportAudit = Command.make("export", {
  from: Flag.String("from").pipe(Flag.withDescription("Start, inclusive: 2026-07-01 or 30d (ago)")),
  to: Flag.String("to").pipe(Flag.withDescription("End, exclusive (default: now)"), Flag.optional)
}, (flags) =>
  Effect.gen(function*() {
    const now = yield* DateTime.now
    const from = yield* moment("from", flags.from, now)
    const to = Option.isSome(flags.to) ? yield* moment("to", flags.to.value, now) : now
    const ndjson = yield* (yield* api).audit.export({ query: { from, to } })
    if (ndjson.length > 0) yield* out(ndjson.replace(/\n$/, ""))
  })).pipe(
    Command.withDescription("Export audit events as NDJSON evidence (one chained event per line)"),
    Command.withExamples([{ command: "smartplane audit export --from 2026-07-01 --to 2026-10-01 > q3.ndjson", description: "A quarter of evidence" }])
  )
