import { Effect, FileSystem, Option, Path } from "effect"
import type { Questions } from "../../app/ask"
import { indented, unifiedDiff } from "../../app/diff"
import { Host } from "../../app/host"
import { note } from "../../app/output"
import { projectRoot, targetDir } from "../../skills/disk"
import { manifestFile } from "../../skills/manifest"
import { type SyncReport, syncSkills } from "../../skills/sync"
import { writeClientConfig } from "../connect/config-file"
import { mergeSessionHook } from "../connect/hook"
import { step, type Step } from "./report"

export type SkillsMode = "local" | "global" | "none"

export interface SkillsFlags {
  readonly skills: Option.Option<SkillsMode>
  readonly hook: boolean
}

const tradeOff = "Synced skills are copies: they work offline with their scripts, but a revoked skill stays on disk until the next sync."

/** Where skills were synced before: a Smartplane manifest in the project's or the home skill folders. */
const syncedBefore = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const host = yield* Host
  const has = (base: string) =>
    Effect.map(Effect.forEach(["claude", "agents"] as const, (target) => fs.exists(path.join(targetDir(path, base, target), manifestFile))), (found) => found.some(Boolean))
  if (yield* has(yield* projectRoot(host.cwd))) return Option.some<SkillsMode>("local")
  if (yield* has(host.home)) return Option.some<SkillsMode>("global")
  return Option.none<SkillsMode>()
})

/** The Claude Code SessionStart hook that re-syncs, so a revoked skill is gone by the next session. */
const installHook = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const file = (yield* Path.Path).join(yield* projectRoot((yield* Host).cwd), ".claude", "settings.json")
  const existing = (yield* fs.exists(file)) ? yield* fs.readFileString(file) : undefined
  const merged = yield* Effect.fromResult(mergeSessionHook(existing, file))
  if (merged.change === "unchanged") return "unchanged" as const
  yield* note(`✓ Added a SessionStart hook to ${file}\n${indented(unifiedDiff(file, existing ?? "", merged.text))}`)
  yield* writeClientConfig(file, merged.text)
  return "added" as const
})

const hookPresent = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const file = (yield* Path.Path).join(yield* projectRoot((yield* Host).cwd), ".claude", "settings.json")
  return (yield* fs.exists(file)) && (yield* fs.readFileString(file)).includes("smartplane skills sync")
})

/** Offers `skills sync` (project or home folders) and, for Claude Code in a project, the re-sync hook. */
export const setupSkills = (q: Questions, flags: SkillsFlags, claudeCode: boolean) =>
  Effect.gen(function*() {
    const before = yield* syncedBefore
    const mode = Option.isSome(flags.skills)
      ? flags.skills.value
      : Option.isSome(before)
      ? "none"
      : yield* q.select<SkillsMode>("skills", `Write your skills to disk? ${tradeOff}`, [
        { title: "This project (.claude/skills and .agents/skills)", value: "local", selected: true },
        { title: "All projects (~/.claude/skills and ~/.agents/skills)", value: "global" },
        { title: "No: agents read skills over MCP only (revocation is instant)", value: "none" }
      ])
    let reports: ReadonlyArray<SyncReport> = []
    if (mode !== "none") {
      reports = yield* syncSkills({ global: mode === "global", targets: ["claude", "agents"], dryRun: false, force: false, project: Option.none() })
      for (const report of reports) yield* note(`✓ Skills in ${report.dir}: ${report.steps.length === 0 ? "none granted yet" : report.steps.map((s) => `${s.slug} (${s.action})`).join(", ")}`)
    }
    const local = mode === "local" || (mode === "none" && Option.getOrUndefined(before) === "local")
    let hook: "added" | "unchanged" | null = null
    if (local && claudeCode) {
      if (yield* hookPresent) hook = "unchanged"
      else if (flags.hook || (q.live && (yield* q.confirm("hook", "Add a Claude Code SessionStart hook that re-syncs skills, so revoked ones are gone by the next session?", true)))) {
        hook = yield* installHook
      }
    }
    return { reports, hook, step: skillsStep(mode, before, hook, reports) }
  })

const skillsStep = (mode: SkillsMode, before: Option.Option<SkillsMode>, hook: "added" | "unchanged" | null, reports: ReadonlyArray<SyncReport>): Step => {
  const hookText = hook === "added" ? "; SessionStart hook added" : hook === "unchanged" ? "; hook already installed" : ""
  if (mode === "none" && Option.isSome(before)) {
    return step("skills", hook === "added" ? "done" : "unchanged", `already synced (${before.value}); \`smartplane skills sync\` refreshes${hookText}`)
  }
  if (mode === "none") return step("skills", "skipped", "served over MCP only; run `smartplane skills sync` to write them to disk")
  const count = new Set(reports.flatMap((report) => report.steps.map((s) => s.slug))).size
  return step("skills", "done", `${count} skill${count === 1 ? "" : "s"} synced to ${mode === "global" ? "your home folder" : "this project"}${hookText}`)
}
