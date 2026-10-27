import { Effect, FileSystem, Option, Path, Result } from "effect"
import type { Questions } from "../../app/ask"
import { indented, unifiedDiff } from "../../app/diff"
import { Host } from "../../app/host"
import { note } from "../../app/output"
import { parseConfig } from "../connect/merge"

/** Scripts that start the app locally, where the values from `.env` were read. */
const wrapped = ["dev", "start", "serve", "preview"]

/** `smartplane run -- a && b` would only wrap `a`, so chained commands are left for a person to wrap. */
const chained = /&&|\|\||[;|<>]/

export interface ScriptsPatch {
  readonly text: string
  readonly scripts: ReadonlyArray<string>
  readonly leftAlone: ReadonlyArray<string>
}

/**
 * `"dev": "next dev"` becomes `"dev": "smartplane run -- next dev"`, keeping the file's key order and indent.
 * `None` when there is nothing to change, or package.json is not plain JSON.
 */
export const patchPackageScripts = (text: string): Option.Option<ScriptsPatch> => {
  const parsed = parseConfig(text, "package.json")
  if (Result.isFailure(parsed)) return Option.none()
  const scripts = parsed.success["scripts"]
  if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) return Option.none()
  const next: Record<string, unknown> = { ...scripts }
  const changed: Array<string> = []
  const leftAlone: Array<string> = []
  for (const name of wrapped) {
    const command = next[name]
    if (typeof command !== "string" || command.includes("smartplane run")) continue
    if (chained.test(command)) {
      leftAlone.push(name)
      continue
    }
    next[name] = `smartplane run -- ${command}`
    changed.push(name)
  }
  if (changed.length === 0) return Option.none()
  const indent = /^([ \t]+)"/m.exec(text)?.[1] ?? "  "
  return Option.some({ text: `${JSON.stringify({ ...parsed.success, scripts: next }, null, indent)}\n`, scripts: changed, leftAlone })
}

/** Shows the package.json change as a diff, then applies it on `--patch-scripts` or a yes. */
export const offerScriptsPatch = (q: Questions, patchScripts: boolean) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const file = (yield* Path.Path).join((yield* Host).cwd, "package.json")
    if (!(yield* fs.exists(file))) return []
    const before = yield* fs.readFileString(file)
    const patch = patchPackageScripts(before)
    if (Option.isNone(patch)) return []
    const { leftAlone, scripts, text } = patch.value
    yield* note(`package.json: run ${scripts.join(", ")} under smartplane run:\n${indented(unifiedDiff(file, before, text))}`)
    if (leftAlone.length > 0) yield* note(`  Left alone (chained commands; wrap them by hand): ${leftAlone.join(", ")}`)
    if (!patchScripts && !(q.live && (yield* q.confirm("patch-scripts", "Apply this change to package.json?", true)))) return []
    yield* fs.writeFileString(file, text)
    yield* note(`✓ Updated ${file}.`)
    return scripts
  })
