import { Effect } from "effect"
import { CliError, Command } from "effect/cli"
import { type AppError, toFailure } from "./app/describe-error"
import { note } from "./app/output"
import { globalSettings } from "./app/settings"
import { approvals } from "./commands/approvals"
import { audit } from "./commands/audit"
import { login } from "./commands/auth/login"
import { logout } from "./commands/auth/logout"
import { whoami } from "./commands/auth/whoami"
import { connect } from "./commands/connect"
import { grants } from "./commands/grants"
import { init } from "./commands/init"
import { integrations } from "./commands/integrations"
import { machineTokens } from "./commands/machine-tokens"
import { members } from "./commands/members"
import { resources } from "./commands/resources"
import { rules } from "./commands/rules"
import { run } from "./commands/run"
import { secrets } from "./commands/secrets"
import { skills } from "./commands/skills"
import { tokens } from "./commands/tokens"
import { cliVersion } from "./version"

export const smartplane = Command.make("smartplane").pipe(
  Command.withDescription("Smartplane: govern what your AI agents can reach."),
  Command.withSubcommands([
    { group: "Account", commands: [init, login, logout, whoami] },
    { group: "Clients", commands: [connect, skills] },
    { group: "Secrets", commands: [run, secrets] },
    { group: "Access", commands: [resources, integrations, grants, rules, approvals, tokens, machineTokens, members] },
    { group: "Evidence", commands: [audit] }
  ]),
  Command.withGlobalFlags(globalSettings)
)

/** Prints a failure once (effect/cli has already shown parse errors with help) and keeps its exit code. */
const report = (error: AppError) =>
  Effect.gen(function*() {
    // `run` passes its child's exit status through; the child has already said what went wrong.
    if (error._tag === "ChildExit") {
      if (error.detail !== undefined) yield* note(`smartplane: ${error.detail}`)
      return yield* error
    }
    const failure = toFailure(error)
    if (!CliError.isCliError(error)) {
      yield* note(`error: ${failure.message}`)
      if (failure.hint !== undefined) yield* note(`hint: ${failure.hint}`)
    }
    return yield* failure
  })

export const main = Command.run(smartplane, { version: cliVersion }).pipe(Effect.catch(report))
