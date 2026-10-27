import { Effect, FileSystem, Path } from "effect"
import { Host } from "../../app/host"
import { clients } from "../connect/clients"
import type { InitReport } from "./report"

/** `npm run dev`, or the same for the package manager whose lock file is here; `undefined` without a dev script. */
const devCommand = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { cwd } = yield* Host
  const file = path.join(cwd, "package.json")
  if (!(yield* fs.exists(file)) || !(yield* fs.readFileString(file)).includes("\"dev\"")) return undefined
  const has = (name: string) => fs.exists(path.join(cwd, name))
  if ((yield* has("bun.lock")) || (yield* has("bun.lockb"))) return "bun run dev"
  if (yield* has("pnpm-lock.yaml")) return "pnpm dev"
  if (yield* has("yarn.lock")) return "yarn dev"
  return "npm run dev"
})

/** What to do after init, in order: run the app under `smartplane run`, clean up, then the clients' own steps. */
export const nextSteps = (report: Omit<InitReport, "next">, apiUrl: string) =>
  Effect.gen(function*() {
    const next: Array<string> = []
    const { secrets } = report
    if (secrets.created.length > 0) {
      const dev = yield* devCommand
      const patched = secrets.packageScripts.includes("dev")
      next.push(dev === undefined
        ? "Start your app with `smartplane run -- <your command>`."
        : patched
        ? `\`${dev}\` now runs under smartplane run (package.json was updated).`
        : `Replace \`${dev}\` with \`smartplane run -- ${dev}\`.`)
      next.push("Once your app works that way, delete the .env file yourself; init never touches it.")
      for (const file of secrets.files.filter((f) => f.tracked)) next.push(`Rotate the values from ${file.path}: they are in your git history.`)
    }
    for (const change of report.clients.filter((c) => c.change === "added" || c.change === "updated")) {
      const after = clients.find((client) => client.id === change.client)?.after
      if (after !== undefined) next.push(after)
    }
    if (report.verify !== null && report.verify.tools === 0) next.push(`No tools yet: ask an admin for access, or add one at ${apiUrl}/resources.`)
    if (report.skills.length === 0 && report.steps.some((s) => s.step === "skills" && s.status === "skipped")) next.push("`smartplane skills sync` writes your skills to disk whenever you want them there.")
    return next
  })
