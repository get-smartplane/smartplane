import { Guard } from "@pc/domain"
import { Effect } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { emit } from "../../app/output"
import { resolveGuard } from "../../resolve/entities"
import { ruleDetails } from "./describe"
import { waitForVerify } from "./wait"

export const ruleArgument = Argument.String("rule").pipe(Argument.withDescription("Rule name or id"))

export const getRule = Command.make("get", { rule: ruleArgument }, ({ rule }) =>
  Effect.gen(function*() {
    const client = yield* api
    const id = yield* resolveGuard(client)(rule)
    yield* emit(Guard, yield* client.guards.get({ params: { id } }), ruleDetails)
  })).pipe(Command.withDescription("Show a rule: its instructions, examples, latest verify run and self-test"))

export const waitFlag = Flag.Boolean("wait").pipe(
  Flag.withDescription("Follow the run stage by stage until it ends (--no-wait: start it and return at once)"),
  Flag.withDefault(true)
)

export const verifyRule = Command.make("verify", {
  rule: ruleArgument,
  wait: waitFlag,
  resume: Flag.Boolean("continue").pipe(Flag.withDescription("Test a run that waits for you to confirm what the rule names, without pinning it"), Flag.withDefault(false))
}, ({ rule, wait, resume }) =>
  Effect.gen(function*() {
    const client = yield* api
    const id = yield* resolveGuard(client)(rule)
    const started = resume ? yield* client.guards.continueVerify({ params: { id } }) : yield* client.guards.compile({ params: { id } })
    const guard = wait ? yield* waitForVerify(client, started) : started
    yield* emit(Guard, guard, ruleDetails)
  })).pipe(Command.withDescription("Verify the rule in the background: find its tools, draft and review the check, test it on example calls; it returns to draft for review"))

const setStatus = (name: "activate" | "disable", status: "active" | "disabled", description: string) =>
  Command.make(name, { rule: ruleArgument }, ({ rule }) =>
    Effect.gen(function*() {
      const client = yield* api
      const id = yield* resolveGuard(client)(rule)
      yield* emit(Guard, yield* client.guards.update({ params: { id }, payload: { status } }), ruleDetails)
    })).pipe(Command.withDescription(description))

export const activateRule = setStatus("activate", "active", "Start checking agent actions against a reviewed rule")
export const disableRule = setStatus("disable", "disabled", "Stop checking a rule")
