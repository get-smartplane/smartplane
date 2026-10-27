import { Effect, Option, Schema } from "effect"
import { Command, Flag } from "effect/cli"
import { makeApi } from "../../api/client"
import { questions } from "../../app/ask"
import { yesFlag } from "../../app/common-flags"
import { failure, usageFailure } from "../../app/failure"
import { CommaList } from "../../app/flag-values"
import { emit, note } from "../../app/output"
import { principalLabel } from "../auth/identity"
import { connectClients } from "./clients"
import { importSecrets } from "./env/import"
import { nextSteps } from "./next"
import { chooseProject } from "./project"
import { describeReport, InitReport, type Step } from "./report"
import { signIn } from "./sign-in"
import { setupSkills } from "./skills"
import { verifySetup } from "./verify"

const ClientId = Schema.Literals(["claude-code", "cursor", "vscode", "claude-desktop"])

const flags = {
  yes: yesFlag.pipe(Flag.withDescription("Do not ask: take each question's default (needed without a terminal)")),
  project: Flag.String("project").pipe(Flag.withDescription("Project slug, name or id to save in .smartplane/project.json"), Flag.optional),
  clients: Flag.String("clients").pipe(
    Flag.withSchema(CommaList(ClientId)),
    Flag.withDescription("Clients to connect: claude-code,cursor,vscode,claude-desktop (default: the detected ones)"),
    Flag.optional
  ),
  local: Flag.Boolean("local").pipe(Flag.withDescription("Cursor: write ./.cursor/mcp.json instead of ~/.cursor/mcp.json"), Flag.withDefault(false)),
  skills: Flag.Literals("skills", ["local", "global", "none"]).pipe(Flag.withDescription("Sync skills to this project, your home folder, or not at all"), Flag.optional),
  hook: Flag.Boolean("hook").pipe(Flag.withDescription("Add the Claude Code SessionStart hook that re-syncs skills"), Flag.withDefault(false)),
  importEnv: Flag.String("import-env").pipe(Flag.withDescription("Move this dotenv file's values into Smartplane (secrets become deliverable)"), Flag.optional),
  noImportEnv: Flag.Boolean("no-import-env").pipe(Flag.withDescription("Do not offer to move .env values"), Flag.withDefault(false)),
  patchScripts: Flag.Boolean("patch-scripts").pipe(Flag.withDescription("Wrap package.json dev/start scripts in `smartplane run --`"), Flag.withDefault(false))
}

const heading = (n: number, title: string) => note(`\n[${n}/6] ${title}`)

/** Steps that did nothing say so under their heading, as the summary will. */
const quietStep = (s: Step) => (s.status === "unchanged" || s.status === "skipped" ? note(`${s.status === "unchanged" ? "=" : "-"} ${s.detail}`) : Effect.void)

/**
 * Guided setup: every step looks at what is already in place and only offers what is missing, so running it
 * again is safe. Secret values never reach the output: names, kinds and masked previews only.
 */
export const init = Command.make("init", flags, (input) =>
  Effect.gen(function*() {
    const q = yield* questions(input.yes)
    if (!q.live && !input.yes) {
      return yield* usageFailure(
        "`smartplane init` asks questions, and there is no terminal to ask them in.",
        "Pass --yes to take the defaults, e.g. `smartplane init --yes --clients claude-code --skills local --import-env .env`."
      )
    }
    yield* heading(1, "Sign in")
    const { me, session, step: signInStep } = yield* signIn(q)
    const client = yield* makeApi(session.apiUrl, session.token)
    yield* heading(2, "Project")
    const project = yield* chooseProject(q, client, session.apiUrl, input.project)
    const projectId = Option.map(project.project, (p) => p.id)
    yield* heading(3, "Clients")
    const clients = yield* connectClients(q, `${session.apiUrl}/mcp`, { clients: input.clients, local: input.local })
    yield* heading(4, "Skills")
    const claudeCode = clients.changes.some((change) => change.client === "claude-code" && change.change !== "refused")
    const skills = yield* setupSkills(q, { skills: input.skills, hook: input.hook }, claudeCode)
    yield* quietStep(skills.step)
    yield* heading(5, "Secrets")
    const secrets = yield* importSecrets(q, { client, me, projectId: Option.getOrNull(projectId) }, input)
    yield* quietStep(secrets.step)
    yield* heading(6, "Verify")
    const verify = yield* verifySetup(session, me, projectId)

    const report = {
      identity: { as: principalLabel(me.principal), org: me.org.name, profile: session.profile, apiUrl: session.apiUrl },
      project: Option.getOrNull(project.project),
      clients: clients.changes,
      skills: skills.reports,
      hook: skills.hook,
      secrets: secrets.report,
      verify: verify.report,
      steps: [signInStep, project.step, clients.step, skills.step, secrets.step, verify.step]
    }
    yield* note("")
    yield* emit(InitReport, { ...report, next: yield* nextSteps(report, session.apiUrl) }, describeReport)
    if (report.steps.some((s) => s.status === "failed")) return yield* failure("Some steps did not complete; fix them and run `smartplane init` again.")
  })).pipe(
    Command.withDescription("Set up this machine and repository: sign in, pick a project, connect clients, sync skills, move .env values"),
    Command.withExamples([
      { command: "smartplane init", description: "Guided setup; re-run any time, it only offers what is missing" },
      { command: "smartplane init --yes --clients claude-code --skills local", description: "Non-interactive, for scripts" },
      { command: "smartplane init --yes --import-env .env.local --patch-scripts", description: "Also move .env.local into Smartplane" }
    ])
  )
