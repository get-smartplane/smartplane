import { Result } from "effect"
import { describe, expect, it } from "vitest"
import { mergeSessionHook, syncHookCommand } from "./hook"

const merged = (existing: string | undefined) => {
  const result = mergeSessionHook(existing, "settings.json")
  if (Result.isFailure(result)) throw new Error(result.failure.message)
  return result.success
}

describe("mergeSessionHook", () => {
  it("adds the hook to a new settings file", () => {
    const settings = JSON.parse(merged(undefined).text)
    expect(settings.hooks.SessionStart).toEqual([{ matcher: "startup", hooks: [{ type: "command", command: syncHookCommand }] }])
  })

  it("keeps existing hooks and settings", () => {
    const existing = JSON.stringify({
      model: "opus",
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }], PreToolUse: [{ matcher: "Bash", hooks: [] }] }
    })
    const settings = JSON.parse(merged(existing).text)
    expect(settings.model).toBe("opus")
    expect(settings.hooks.PreToolUse).toEqual([{ matcher: "Bash", hooks: [] }])
    expect(settings.hooks.SessionStart[0].hooks[0].command).toBe("echo hi")
    expect(settings.hooks.SessionStart).toHaveLength(2)
  })

  it("is idempotent", () => {
    const once = merged(undefined).text
    const twice = merged(once)
    expect(twice.change).toBe("unchanged")
    expect(twice.text).toBe(once)
  })

  it("refuses settings it cannot merge safely", () => {
    for (const bad of ["{ // c\n}", JSON.stringify({ hooks: [] }), JSON.stringify({ hooks: { SessionStart: {} } })]) {
      expect(Result.isFailure(mergeSessionHook(bad, "settings.json"))).toBe(true)
    }
  })
})
