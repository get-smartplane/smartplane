import type { Me, ProjectId } from "@pc/domain"
import { Effect, FileSystem, Option, Path, Redacted } from "effect"
import type { Api } from "../../../api/client"
import type { Questions } from "../../../app/ask"
import { usageFailure } from "../../../app/failure"
import { Host } from "../../../app/host"
import { note } from "../../../app/output"
import { table } from "../../../app/table"
import { offerScriptsPatch } from "../package-scripts"
import { emptySecrets, type SecretsReport, step, type Step } from "../report"
import { readCandidates } from "./candidates"
import { maskedPreview } from "./classify"
import { createImported, type Created, type Skipped, takenNames } from "./create"
import { discoverEnvFiles, type EnvFile, trackedByGit } from "./discover"

export interface SecretsFlags {
  readonly importEnv: Option.Option<string>
  readonly noImportEnv: boolean
  readonly patchScripts: boolean
}

export interface SecretsContext {
  readonly client: Api
  readonly me: Me
  readonly projectId: ProjectId | null
}

const skip = (detail: string, report: SecretsReport = emptySecrets) => ({ report, step: step("secrets", "skipped", detail) })

/** `--import-env <file>`, or the dotenv files in this folder. */
const envFiles = (explicit: Option.Option<string>) =>
  Effect.gen(function*() {
    const { cwd } = yield* Host
    const path = yield* Path.Path
    const found = yield* discoverEnvFiles(cwd)
    if (Option.isNone(explicit)) return { found, chosen: Option.none<ReadonlyArray<EnvFile>>() }
    const full = path.resolve(cwd, explicit.value)
    if (!(yield* (yield* FileSystem.FileSystem).exists(full))) return yield* usageFailure(`--import-env: ${explicit.value} does not exist.`)
    const known = found.find((file) => file.path === full)
    const file = known ?? { name: path.basename(full), path: full, tracked: (yield* trackedByGit(path.dirname(full), [path.basename(full)])).size > 0 }
    return { found: known === undefined ? [...found, file] : found, chosen: Option.some([file]) }
  })

/**
 * Offers to move values from dotenv files into Smartplane as secrets and variables, leaving the files
 * untouched. Values are never printed: only names, kinds and masked previews.
 */
export const importSecrets = (q: Questions, context: SecretsContext, flags: SecretsFlags) =>
  Effect.gen(function*() {
    if (flags.noImportEnv) return skip("--no-import-env")
    const { chosen, found } = yield* envFiles(flags.importEnv)
    if (found.length === 0) return skip("no .env files here")
    for (const file of found.filter((f) => f.tracked)) {
      yield* note(`! ${file.name} is tracked by git: its values are in the repository history. Rotate them once they live in Smartplane.`)
    }
    const files = found.map((file) => ({ path: file.path, tracked: file.tracked }))
    // Without resources:read the list may be refused; creating would be refused too, and says why.
    const taken = takenNames(yield* context.client.resources.list({ query: {} }).pipe(Effect.orElseSucceed(() => [])), context.projectId)
    if (Option.isNone(chosen) && (yield* readCandidates(found, { quiet: true })).candidates.every((candidate) => taken(candidate.name))) {
      return { report: { ...emptySecrets, files }, step: step("secrets", "unchanged", `every name in ${found.map((f) => f.name).join(", ")} is already in Smartplane`) }
    }
    if (Option.isNone(chosen) && !q.live) return skip(`found ${found.map((f) => f.name).join(", ")}; pass --import-env <file> to move them`, { ...emptySecrets, files })
    const preferred = found.find((file) => file.name === ".env.local") ?? found.find((file) => file.name === ".env") ?? found[0]
    const pickedNames = Option.isSome(chosen) ? chosen.value.map((file) => file.name) : yield* q.multiSelect("env-files", "Move values from which files into Smartplane? The files themselves are left alone.", found.map((file) => ({
      title: `${file.name}${file.tracked ? " (tracked by git)" : ""}`,
      value: file.name,
      selected: file === preferred
    })))
    const picked = found.filter((file) => pickedNames.includes(file.name))
    if (picked.length === 0) return skip("no file chosen", { ...emptySecrets, files })
    if (!context.me.principal.permissions.includes("resources:manage")) {
      return skip("creating secrets needs the resources:manage permission: ask an admin to import them", { ...emptySecrets, files })
    }
    const read = yield* readCandidates(picked)
    const fresh = read.candidates.filter((candidate) => !taken(candidate.name))
    const skipped = [...read.skipped, ...read.candidates.filter((candidate) => taken(candidate.name)).map((c) => ({ name: c.name, reason: "already in Smartplane" }))]
    for (const entry of skipped) yield* note(`  - ${entry.name}: ${entry.reason}`)
    if (fresh.length === 0) {
      return { report: { ...emptySecrets, files, skipped }, step: step("secrets", "unchanged", `nothing new to move: ${skipped.length} name${skipped.length === 1 ? "" : "s"} skipped`) }
    }
    yield* note(table(["name", "kind", "value", "from", "why"], fresh.map((c) => [c.name, c.kind, maskedPreview(Redacted.value(c.value)), c.file, c.reason])))
    const names = yield* q.multiSelect("env-names", "Move which names?", fresh.map((c) => ({ title: `${c.name}  ${maskedPreview(Redacted.value(c.value))}`, value: c.name, selected: true })))
    const chosenCandidates = fresh.filter((c) => names.includes(c.name))
    const secretNames = yield* q.multiSelect("env-secrets", "Which are secrets? The rest become plain variables, readable by anyone granted them.", chosenCandidates.map((c) => ({
      title: `${c.name} (${c.reason})`,
      value: c.name,
      selected: c.kind === "secret"
    })))
    const classified = chosenCandidates.map((c) => ({ ...c, kind: secretNames.includes(c.name) ? "secret" as const : "variable" as const }))
    const secretCount = classified.filter((c) => c.kind === "secret").length
    const deliverable = secretCount > 0 && (yield* q.confirm(
      "deliverable",
      `Mark the ${secretCount} secret${secretCount === 1 ? "" : "s"} deliverable and give yourself \`use\` on them? \`smartplane run\` can then put their values into the environment of commands you start; otherwise they are usable only through gateway tools.`,
      true
    ))
    const results = yield* Effect.forEach(classified, (candidate) => createImported(context.client, context.me, context.projectId, candidate, deliverable))
    const created = results.filter((r): r is Created => r._tag === "Created")
    const failed = results.filter((r): r is Skipped => r._tag === "Skipped")
    for (const r of created) yield* note(`✓ ${r.name}: ${r.kind}${r.deliverable && r.kind === "secret" ? ", deliverable" : ""}${r.granted && r.kind === "secret" ? ", you hold use" : ""}`)
    for (const r of failed) yield* note(`  - ${r.name}: ${r.reason}`)
    const ungranted = created.filter((r) => r.kind === "secret" && r.deliverable && !r.granted).map((r) => r.name)
    if (ungranted.length > 0) yield* note(`! Ask an admin to grant you \`use\` on ${ungranted.join(", ")}: \`smartplane run\` delivers only what you hold \`use\` on.`)
    const packageScripts = created.length > 0 ? yield* offerScriptsPatch(q, flags.patchScripts) : []
    const report: SecretsReport = {
      files,
      created: created.map(({ deliverable, granted, kind, name }) => ({ name, kind, deliverable, granted })),
      skipped: [...skipped, ...failed.map(({ name, reason }) => ({ name, reason }))],
      packageScripts
    }
    return { report, step: secretsStep(report, picked) }
  })

const secretsStep = (report: SecretsReport, picked: ReadonlyArray<EnvFile>): Step => {
  const count = (kind: "secret" | "variable") => report.created.filter((c) => c.kind === kind).length
  const skipped = report.skipped.length > 0 ? `; ${report.skipped.length} skipped` : ""
  const detail = `${count("secret")} secrets and ${count("variable")} variables moved from ${picked.map((f) => f.name).join(", ")}${skipped}`
  return step("secrets", report.created.length > 0 ? "done" : "skipped", detail)
}
