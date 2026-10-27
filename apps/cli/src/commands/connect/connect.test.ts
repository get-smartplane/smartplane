import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fakeMcp } from "../../testing/fake-mcp"
import { token } from "../../testing/fixtures"
import { runCli, tempDir } from "../../testing/run-cli"

const created = { token, plaintext: "pc_minted_for_client", mcpUrl: "https://app.smartplane.dev/mcp" }
const routes = { "POST /api/tokens": { status: 201, body: created } }

const setup = () => {
  const home = tempDir()
  const cwd = tempDir()
  mkdirSync(join(cwd, ".git"))
  return { home, cwd, connect: (...args: Array<string>) => runCli(["connect", ...args], { home, cwd, routes, env: { SMARTPLANE_TOKEN: "pc_cli" } }) }
}

describe("smartplane connect", () => {
  it.each([
    ["claude-code", (s: { cwd: string; home: string }) => join(s.cwd, ".mcp.json"), "mcpServers"],
    ["cursor", (s: { cwd: string; home: string }) => join(s.home, ".cursor", "mcp.json"), "mcpServers"],
    ["vscode", (s: { cwd: string; home: string }) => join(s.cwd, ".vscode", "mcp.json"), "servers"],
    ["claude-desktop", (s: { cwd: string; home: string }) => join(s.home, ".config", "Claude", "claude_desktop_config.json"), "mcpServers"]
  ] as const)("%s: merges into the client's file without clobbering other servers", async (client, pathOf, key) => {
    const s = setup()
    const file = pathOf(s)
    mkdirSync(join(file, ".."), { recursive: true })
    writeFileSync(file, JSON.stringify({ [key]: { other: { command: "x" } }, keep: 1 }))
    const run = await s.connect(client)
    expect(run.exitCode).toBe(0)
    const config = JSON.parse(readFileSync(file, "utf8"))
    expect(config.keep).toBe(1)
    expect(config[key].other).toEqual({ command: "x" })
    expect(JSON.stringify(config[key].smartplane)).toContain("https://app.smartplane.dev/mcp")
    expect(JSON.stringify(config)).not.toContain("Bearer")
    expect(run.requests).toEqual([])
  })

  it("--dry-run prints a diff and writes nothing", async () => {
    const s = setup()
    const run = await s.connect("claude-code", "--dry-run", "--token")
    expect(run.stderr).toContain("+++")
    expect(run.stderr).toContain("<new pc_ token>")
    expect(existsSync(join(s.cwd, ".mcp.json"))).toBe(false)
    expect(run.requests).toEqual([])
  })

  it("--token mints a dedicated token, embeds it and makes the file owner-only", async () => {
    const s = setup()
    const run = await s.connect("cursor", "--token", "--ttl", "30d", "--json")
    expect(run.requests[0]?.body).toEqual({ name: "smartplane connect cursor", kind: "personal", projectId: null, ttlDays: 30 })
    const file = join(s.home, ".cursor", "mcp.json")
    expect(JSON.parse(readFileSync(file, "utf8")).mcpServers.smartplane.headers).toEqual({ Authorization: "Bearer pc_minted_for_client" })
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(JSON.parse(run.stdout)).toMatchObject({ client: "cursor", auth: "token", tokenId: token.id, change: "added" })
  })

  it("refuses a config with comments and mints nothing", async () => {
    const s = setup()
    mkdirSync(join(s.cwd, ".vscode"))
    writeFileSync(join(s.cwd, ".vscode", "mcp.json"), "{ // mine\n}")
    const run = await s.connect("vscode", "--token")
    expect(run.exitCode).toBe(1)
    expect(run.requests).toEqual([])
    expect(readFileSync(join(s.cwd, ".vscode", "mcp.json"), "utf8")).toBe("{ // mine\n}")
  })

  it("print shows every client's snippet", async () => {
    const run = await runCli(["connect", "print", "--json"])
    expect(JSON.parse(run.stdout).map((s: { id: string }) => s.id)).toEqual(["claude-code-cli", "claude-code", "cursor", "vscode", "claude-desktop"])
  })

  it("claude-code --sync-skills adds a SessionStart hook next to existing hooks and syncs once", async () => {
    const s = setup()
    mkdirSync(join(s.cwd, ".claude"))
    writeFileSync(join(s.cwd, ".claude", "settings.json"), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }] } }))
    const { mcp } = fakeMcp(() => [{ slug: "notes", description: "d", version: "v1", files: [{ path: "SKILL.md", text: "x" }] }])
    const run = await runCli(["connect", "claude-code", "--sync-skills"], { home: s.home, cwd: s.cwd, env: { SMARTPLANE_TOKEN: "pc_cli" }, mcp })
    expect(run.exitCode).toBe(0)
    const hooks = JSON.parse(readFileSync(join(s.cwd, ".claude", "settings.json"), "utf8")).hooks.SessionStart
    expect(hooks.map((h: { hooks: Array<{ command: string }> }) => h.hooks[0]?.command)).toEqual(["echo hi", "smartplane skills sync --quiet --target claude"])
    expect(existsSync(join(s.cwd, ".claude", "skills", "notes", "SKILL.md"))).toBe(true)
    const noHook = setup()
    await runCli(["connect", "claude-code", "--sync-skills", "--no-hook"], { home: noHook.home, cwd: noHook.cwd, env: { SMARTPLANE_TOKEN: "pc_cli" }, mcp })
    expect(existsSync(join(noHook.cwd, ".claude", "settings.json"))).toBe(false)
  })
})
