import type { ProjectId } from "@pc/domain"
import { Effect, FileSystem, Option, Path } from "effect"
import type { Api } from "../../api/client"
import { DefaultApiUrl } from "../../api/session"
import type { Choice, Questions } from "../../app/ask"
import { Host } from "../../app/host"
import { note } from "../../app/output"
import { projectConfigFile, readProjectConfig, writeProjectConfig } from "../../config/project-config"
import { projectNaming } from "../../resolve/entities"
import { pick } from "../../resolve/pick"
import { projectRoot } from "../../skills/disk"
import { step, type Step } from "./report"

export interface ProjectChoice {
  readonly project: Option.Option<{ readonly id: ProjectId; readonly name: string; readonly file: string }>
  readonly step: Step
}

const none = "none"

/** Keeps `.smartplane/` out of git when the person would rather not commit it (it holds no secrets either way). */
const ignoreInGit = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const file = (yield* Path.Path).join(root, ".gitignore")
    const current = (yield* fs.exists(file)) ? yield* fs.readFileString(file) : ""
    if (current.split(/\r?\n/).some((line) => line.trim() === ".smartplane/" || line.trim() === ".smartplane")) return
    yield* fs.writeFileString(file, `${current}${current === "" || current.endsWith("\n") ? "" : "\n"}.smartplane/\n`)
    yield* note(`  Added .smartplane/ to ${file}.`)
  })

/**
 * Which project this repository belongs to, kept in `.smartplane/project.json` so `run` and `skills sync`
 * default to it. An existing file is kept; `--project` or the picker writes a new one.
 */
export const chooseProject = (q: Questions, client: Api, apiUrl: string, flag: Option.Option<string>) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const root = yield* projectRoot((yield* Host).cwd)
    const file = projectConfigFile(path, root)
    const projects = (yield* client.projects.list({ query: {} })).filter((project) => project.archivedAt === null)
    const existing = yield* readProjectConfig
    if (Option.isSome(existing) && Option.isNone(flag)) {
      const name = projects.find((project) => project.id === existing.value.projectId)?.name ?? existing.value.projectId
      yield* note(`= Project ${name} (from ${file}).`)
      return { project: Option.some({ id: existing.value.projectId, name, file }), step: step("project", "unchanged", `${name}, from .smartplane/project.json`) } satisfies ProjectChoice
    }
    if (Option.isNone(flag) && projects.length === 0) {
      return { project: Option.none(), step: step("project", "skipped", "this org has no projects; org-wide resources only") } satisfies ProjectChoice
    }
    const choices: ReadonlyArray<Choice<string>> = [
      { title: "No project (org-wide resources only)", value: none, selected: true },
      ...projects.map((project) => ({ title: `${project.name} (${project.slug})`, value: project.id }))
    ]
    const picked = Option.isSome(flag)
      ? (yield* pick(projectNaming, flag.value, projects)).id
      : yield* q.select("project", "Which Smartplane project is this repository?", choices)
    const project = projects.find((candidate) => candidate.id === picked)
    if (project === undefined) return { project: Option.none(), step: step("project", "skipped", "no project: org-wide resources only") } satisfies ProjectChoice
    yield* writeProjectConfig({ projectId: project.id, ...(apiUrl === DefaultApiUrl ? {} : { apiUrl }) })
    yield* note(`✓ Wrote ${file} (project ${project.name}). It holds ids only, no secrets.`)
    const inGit = yield* (yield* FileSystem.FileSystem).exists(path.join(root, ".git"))
    if (inGit && !(yield* q.confirm("commit-project", "Commit .smartplane/project.json so teammates get the same project? It holds no secrets.", true))) {
      yield* ignoreInGit(root)
    }
    return { project: Option.some({ id: project.id, name: project.name, file }), step: step("project", "done", `${project.name}, saved to .smartplane/project.json`) } satisfies ProjectChoice
  })
