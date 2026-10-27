import { Effect, Option, Schema } from "effect"
import { Command, Flag } from "effect/cli"
import { currentSession } from "../../api/session"
import { emit, note } from "../../app/output"
import { tableOr } from "../../app/table"
import type { SkillTarget } from "../../skills/disk"
import { McpConnection } from "../../skills/mcp"
import { listSkills, SkillArgument } from "../../skills/source"
import { type SyncReport, SyncReport as Report, syncSkills } from "../../skills/sync"

const SkillSummary = Schema.Struct({
  slug: Schema.String,
  description: Schema.String,
  arguments: Schema.Array(SkillArgument),
  version: Schema.NullOr(Schema.String),
  files: Schema.Array(Schema.String)
})

const listCommand = Command.make("ls", {}, () =>
  Effect.scoped(Effect.gen(function*() {
    const session = yield* currentSession
    const mcp = yield* (yield* McpConnection).open(`${session.apiUrl}/mcp`, session.token)
    const { skills } = yield* listSkills(mcp)
    const rows = skills.map((s) => ({
      slug: s.slug,
      description: s.description,
      arguments: s.arguments,
      version: Option.getOrNull(s.version),
      files: s.entries.map((entry) => entry.path)
    }))
    yield* emit(Schema.Array(SkillSummary), rows, (list) =>
      tableOr("No skills are granted to you.", ["skill", "files", "arguments", "description"], list.map((s) => [s.slug, s.files.length, s.arguments.map((a) => a.name).join(","), s.description])))
  }))).pipe(Command.withDescription("List the skills you may read (nothing is downloaded)"), Command.withAlias("list"))

const symbol: Record<SyncReport["steps"][number]["action"], string> = {
  create: "+ created",
  update: "~ updated",
  unchanged: "  unchanged",
  delete: "- deleted (no longer granted)",
  forget: "- forgotten (folder already gone)",
  conflict: "! conflict",
  kept: "! kept"
}

const describeReports = (reports: ReadonlyArray<SyncReport>) =>
  reports.map((report) =>
    [
      `${report.dryRun ? "[dry run] " : ""}${report.dir}`,
      ...(report.steps.length === 0 ? ["  no Smartplane skills"] : report.steps.map((step) =>
        `  ${step.slug.padEnd(28)} ${symbol[step.action]}${step.reason === undefined ? "" : `: ${step.reason}`}`))
    ].join("\n")
  ).join("\n\n")

const targets: Record<"claude" | "agents" | "both", ReadonlyArray<SkillTarget>> = { claude: ["claude"], agents: ["agents"], both: ["claude", "agents"] }

const syncCommand = Command.make("sync", {
  global: Flag.Boolean("global").pipe(Flag.withAlias("g"), Flag.withDescription("Write ~/.claude/skills and ~/.agents/skills instead of the project's"), Flag.withDefault(false)),
  target: Flag.Literals("target", ["claude", "agents", "both"]).pipe(Flag.withDescription("Which skill folders to write"), Flag.withDefault("both")),
  dryRun: Flag.Boolean("dry-run").pipe(Flag.withDescription("Show what would change without writing"), Flag.withDefault(false)),
  force: Flag.Boolean("force").pipe(Flag.withDescription("Overwrite or delete Smartplane folders even if edited locally"), Flag.withDefault(false)),
  quiet: Flag.Boolean("quiet").pipe(Flag.withAlias("q"), Flag.withDescription("Print only conflicts (for hooks)"), Flag.withDefault(false)),
  project: Flag.String("project").pipe(Flag.withDescription("Only org-wide skills and this project's (default: .smartplane/project.json)"), Flag.optional)
}, (flags) =>
  Effect.gen(function*() {
    const reports = yield* syncSkills({ global: flags.global, targets: targets[flags.target], dryRun: flags.dryRun, force: flags.force, project: flags.project })
    if (!flags.quiet) return yield* emit(Schema.Array(Report), reports, describeReports)
    for (const report of reports) {
      for (const step of report.steps) {
        if (step.action === "conflict" || step.action === "kept") yield* note(`smartplane skills: ${step.slug} in ${report.dir}: ${step.reason ?? step.action}`)
      }
    }
  })).pipe(
    Command.withDescription("Write the skills you may read as SKILL.md folders; removes ones no longer granted"),
    Command.withExamples([
      { command: "smartplane skills sync", description: "Project .claude/skills and .agents/skills" },
      { command: "smartplane skills sync --global --target claude --dry-run", description: "Preview ~/.claude/skills" }
    ])
  )

export const skills = Command.make("skills").pipe(
  Command.withDescription("Org skills as local SKILL.md folders for Claude Code and other agents"),
  Command.withSubcommands([listCommand, syncCommand])
)
