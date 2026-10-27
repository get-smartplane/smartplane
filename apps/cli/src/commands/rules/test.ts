import { GuardTestResult } from "@pc/domain"
import { Effect, Schema } from "effect"
import { Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { CommaList } from "../../app/flag-values"
import { emit } from "../../app/output"
import { resolveGuard } from "../../resolve/entities"
import { ruleArgument } from "./lifecycle"

const describeResult = (result: GuardTestResult) =>
  `${result.violates ? "VIOLATES" : "allowed"}: ${Math.round(result.probability * 100)}% likely violation (threshold ${Math.round(result.threshold * 100)}%)`

export const testRule = Command.make("test", {
  rule: ruleArgument,
  tool: Flag.String("tool").pipe(Flag.withSchema(Schema.NonEmptyString), Flag.withDescription("Tool the sample action calls")),
  args: Flag.String("args").pipe(Flag.withSchema(Schema.fromJsonString(Schema.Unknown)), Flag.withDescription("Tool arguments as JSON"), Flag.withDefault({})),
  role: Flag.String("role").pipe(Flag.withDescription("Acting member's role"), Flag.withDefault("member")),
  teams: Flag.String("teams").pipe(Flag.withSchema(CommaList(Schema.String)), Flag.withDescription("Acting member's teams"), Flag.withDefault([]))
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const id = yield* resolveGuard(client)(flags.rule)
    const result = yield* client.guards.test({
      params: { id },
      payload: { tool: flags.tool, arguments: flags.args, actor: { role: flags.role, teams: flags.teams } }
    })
    yield* emit(GuardTestResult, result, describeResult)
  })).pipe(
    Command.withDescription("Dry-run a verified rule against a sample agent action"),
    Command.withExamples([
      { command: "smartplane rules test no-q3-deletes --tool drive__delete_file --args '{\"path\":\"/Q3/report.pdf\"}'", description: "Would this call be flagged?" }
    ])
  )
