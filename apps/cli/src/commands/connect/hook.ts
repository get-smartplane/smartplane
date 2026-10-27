import { Result, Schema } from "effect"
import type { CliFailure } from "../../app/failure"
import { type Merged, parseConfig, refusal } from "./merge"

export const syncHookCommand = "smartplane skills sync --quiet --target claude"

const HookEntry = Schema.Struct({ hooks: Schema.Array(Schema.Struct({ command: Schema.optional(Schema.String) })) })
const isHookEntry = Schema.is(HookEntry)
const isObject = Schema.is(Schema.Record(Schema.String, Schema.Unknown))
const isList = Schema.is(Schema.Array(Schema.Unknown))

/**
 * Adds a Claude Code `SessionStart` hook that re-syncs skills, so a revoked skill's folder is gone by the next
 * session. Existing hooks, matchers and settings are kept as they are; a second run changes nothing.
 */
export const mergeSessionHook = (existing: string | undefined, path: string): Result.Result<Merged, CliFailure> =>
  Result.flatMap(parseConfig(existing, path), (settings): Result.Result<Merged, CliFailure> => {
    const hooks = settings["hooks"] ?? {}
    if (!isObject(hooks)) return Result.fail(refusal(path, "has a \"hooks\" that is not an object"))
    const sessionStart = hooks["SessionStart"] ?? []
    if (!isList(sessionStart)) return Result.fail(refusal(path, "has a \"hooks.SessionStart\" that is not a list"))
    const present = sessionStart.some((entry) =>
      isHookEntry(entry) && entry.hooks.some((hook) => hook.command?.includes("smartplane skills sync") === true))
    if (present) return Result.succeed({ text: existing ?? "", change: "unchanged" })
    const entry = { matcher: "startup", hooks: [{ type: "command", command: syncHookCommand }] }
    const next = { ...settings, hooks: { ...hooks, SessionStart: [...sessionStart, entry] } }
    return Result.succeed({ text: `${JSON.stringify(next, null, 2)}\n`, change: "added" })
  })
