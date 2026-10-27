import { Effect, FileSystem, Option, Path } from "effect"
import { unifiedDiff } from "../../app/diff"
import { Host } from "../../app/host"
import { note } from "../../app/output"
import { projectRoot } from "../../skills/disk"
import { syncSkills } from "../../skills/sync"
import { mergeSessionHook } from "./hook"

/** `connect claude-code --sync-skills`: the hook in the project's `.claude/settings.json`, then a first sync. */
export const connectSkills = (options: { readonly hook: boolean; readonly dryRun: boolean }) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    if (options.hook) {
      const file = path.join(yield* projectRoot((yield* Host).cwd), ".claude", "settings.json")
      const existing = (yield* fs.exists(file)) ? yield* fs.readFileString(file) : undefined
      const merged = yield* Effect.fromResult(mergeSessionHook(existing, file))
      if (options.dryRun) {
        yield* note(unifiedDiff(file, existing ?? "", merged.text) || `${file} already has the sync hook.`)
      } else if (merged.change !== "unchanged") {
        yield* fs.makeDirectory(path.dirname(file), { recursive: true })
        yield* fs.writeFileString(file, merged.text)
        yield* note(`Added a SessionStart hook to ${file}: skills re-sync when a Claude Code session starts.`)
      }
    }
    return yield* syncSkills({ global: false, targets: ["claude"], dryRun: options.dryRun, force: false, project: Option.none() })
  })
