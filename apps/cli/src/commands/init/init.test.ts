import { execFileSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { me, resource } from "../../testing/fixtures"
import { envValues, initSetup } from "../../testing/init-world"
import { tempDir } from "../../testing/run-cli"

/** A person accepting the proposals, picking the API project and Claude Code. */
const interactive = {
  project: "prj_api00001",
  "commit-project": true,
  clients: ["claude-code"],
  skills: "local",
  hook: true,
  "env-files": [".env"],
  deliverable: true,
  "patch-scripts": true
}

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"))
const posted = (run: Awaited<ReturnType<ReturnType<typeof initSetup>["init"]>>, method: string, path: RegExp) =>
  run.requests.filter((request) => request.method === method && path.test(request.path))

const expectNoValues = (output: string) => {
  for (const value of Object.values(envValues)) expect(output).not.toContain(value)
  expect(output).not.toContain("delivered-value-never-printed")
}

describe("smartplane init", () => {
  it("runs every step: sign-in, project, clients, skills, secrets, verify", async () => {
    const s = initSetup()
    const run = await s.init([], { answers: interactive })
    expect(run.exitCode).toBe(0)
    expect(run.asked).toEqual(["project", "commit-project", "clients", "skills", "hook", "env-files", "env-names", "env-secrets", "deliverable", "patch-scripts"])

    expect(json(join(s.cwd, ".smartplane", "project.json"))).toEqual({ projectId: "prj_api00001" })
    expect(json(join(s.cwd, ".mcp.json")).mcpServers.smartplane).toEqual({ type: "http", url: "https://app.smartplane.dev/mcp" })
    expect(existsSync(join(s.cwd, ".claude", "skills", "smartplane", "SKILL.md"))).toBe(true)
    expect(existsSync(join(s.cwd, ".agents", "skills", "smartplane", "SKILL.md"))).toBe(true)
    expect(JSON.stringify(json(join(s.cwd, ".claude", "settings.json")))).toContain("smartplane skills sync --quiet --target claude")
    expect(run.mcpOpened.every((options) => options.projectId === "prj_api00001")).toBe(true)

    const created = posted(run, "POST", /^\/api\/resources$/).map((request) => request.body)
    expect(created).toEqual([
      expect.objectContaining({ name: "STRIPE_SECRET_KEY", projectId: "prj_api00001", config: { kind: "secret", value: envValues.STRIPE_SECRET_KEY } }),
      expect.objectContaining({ name: "DATABASE_URL", config: { kind: "secret", value: envValues.DATABASE_URL } }),
      expect.objectContaining({ name: "SESSION_SIGNING", config: { kind: "secret", value: envValues.SESSION_SIGNING } }),
      expect.objectContaining({ name: "REGION", config: { kind: "variable", value: envValues.REGION, envName: "REGION" } }),
      expect.objectContaining({ name: "VITE_PUBLIC_URL", config: { kind: "variable", value: envValues.VITE_PUBLIC_URL, envName: "VITE_PUBLIC_URL" } })
    ])
    expect(posted(run, "PATCH", /\/delivery$/).map((request) => request.body)).toEqual([
      { delivery: "deliverable", envName: "STRIPE_SECRET_KEY" },
      { delivery: "deliverable", envName: "DATABASE_URL" },
      { delivery: "deliverable", envName: "SESSION_SIGNING" }
    ])
    expect(posted(run, "POST", /^\/api\/grants$/).map((request) => request.body)).toEqual(
      ["res_imported000", "res_imported001", "res_imported002"].map((resourceId) => ({ subject: { type: "user", id: me.principal.userId }, resourceId, action: "use", conditions: {}, expiresAt: null }))
    )
    expect(readFileSync(join(s.cwd, ".env"), "utf8")).toContain(envValues.STRIPE_SECRET_KEY)
    expect(json(join(s.cwd, "package.json")).scripts).toEqual({ dev: "smartplane run -- next dev", build: "next build" })

    expect(run.stdout).toContain("✓ verify")
    expect(run.stdout).toContain("2 tools available to you")
    expect(run.stdout).toContain("smartplane run injects STRIPE_SECRET_KEY, DATABASE_URL, SESSION_SIGNING, REGION, VITE_PUBLIC_URL")
    expect(run.stdout).toContain("delete the .env file yourself")
    expectNoValues(run.stdout + run.stderr)
  })

  it("is idempotent: a second run only reports what is already in place", async () => {
    const s = initSetup()
    await s.init([], { answers: interactive })
    const again = await s.init([], { answers: interactive })
    expect(again.exitCode).toBe(0)
    expect(again.asked).toEqual([])
    expect(posted(again, "POST", /^\/api\/resources$/)).toEqual([])
    expect(again.stdout).toMatch(/= project +API, from \.smartplane\/project\.json/)
    expect(again.stdout).toMatch(/= clients +Claude Code \(\.mcp\.json\): already connected/)
    expect(again.stdout).toMatch(/= skills +already synced \(local\)/)
    expect(again.stdout).toMatch(/= secrets +every name in .env is already in Smartplane/)
    expect(json(join(s.cwd, "package.json")).scripts.dev).toBe("smartplane run -- next dev")
  })

  it("preselects the clients it detects: binaries on PATH and settings folders", async () => {
    const s = initSetup()
    const bin = tempDir()
    writeFileSync(join(bin, "code"), "#!/bin/sh\n")
    chmodSync(join(bin, "code"), 0o755)
    mkdirSync(join(s.home, ".cursor"))
    const run = await s.init(["--yes", "--skills", "none", "--no-import-env"], { env: { SMARTPLANE_TOKEN: "pc_cli", PATH: bin } })
    expect(run.exitCode).toBe(0)
    expect(existsSync(join(s.cwd, ".mcp.json"))).toBe(true)
    expect(existsSync(join(s.home, ".cursor", "mcp.json"))).toBe(true)
    expect(existsSync(join(s.cwd, ".vscode", "mcp.json"))).toBe(true)
    expect(existsSync(join(s.home, ".config", "Claude", "claude_desktop_config.json"))).toBe(false)
  })

  it("merges into existing configs without touching other servers, and refuses files it cannot rewrite", async () => {
    const s = initSetup()
    writeFileSync(join(s.cwd, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "uvx", args: ["x"] } }, keep: true }))
    mkdirSync(join(s.cwd, ".vscode"))
    writeFileSync(join(s.cwd, ".vscode", "mcp.json"), "{ // mine\n}")
    const run = await s.init(["--yes", "--clients", "claude-code,vscode", "--skills", "none", "--no-import-env"])
    const config = json(join(s.cwd, ".mcp.json"))
    expect(config.mcpServers.other).toEqual({ command: "uvx", args: ["x"] })
    expect(config.keep).toBe(true)
    expect(config.mcpServers.smartplane.url).toBe("https://app.smartplane.dev/mcp")
    expect(run.stderr).toContain("+    \"smartplane\": {")
    expect(readFileSync(join(s.cwd, ".vscode", "mcp.json"), "utf8")).toBe("{ // mine\n}")
    expect(run.stdout).toMatch(/✗ clients .*VS Code \(\.vscode\/mcp\.json\): refused/)
    expect(run.exitCode).toBe(1)
  })

  it("lets the person reclassify names, and never prints a value", async () => {
    const s = initSetup()
    const run = await s.init(["--skills", "none"], {
      answers: { ...interactive, clients: [], "env-names": ["STRIPE_SECRET_KEY", "REGION"], "env-secrets": ["STRIPE_SECRET_KEY", "REGION"], "patch-scripts": false }
    })
    const kinds = posted(run, "POST", /^\/api\/resources$/).map((request) => JSON.stringify(request.body).match(/"kind":"(\w+)"/)?.[1])
    expect(kinds).toEqual(["secret", "secret"])
    expect(run.stderr).toMatch(/STRIPE_SECRET_KEY +secret +sk_l…\(40 chars\) +\.env +name/)
    expect(run.stderr).toMatch(/REGION +variable +eu-w…\(16 chars\)/)
    expect(run.stderr).toContain("package.json: run dev under smartplane run")
    expect(json(join(s.cwd, "package.json")).scripts.dev).toBe("next dev")
    expectNoValues(run.stdout + run.stderr)
  })

  it("warns about .env files tracked by git and says to rotate them", async () => {
    const s = initSetup({ git: true })
    execFileSync("git", ["add", ".env"], { cwd: s.cwd })
    const run = await s.init(["--yes", "--clients", "claude-code", "--skills", "none", "--import-env", ".env"])
    expect(run.exitCode).toBe(0)
    expect(run.stderr).toContain(".env is tracked by git: its values are in the repository history")
    expect(run.stdout).toContain("Rotate the values from")
    expect(JSON.parse((await s.init(["--yes", "--skills", "none", "--no-import-env", "--json"])).stdout).secrets.files).toEqual([])
  })

  it("skips names that already exist in Smartplane and reports them", async () => {
    const s = initSetup({ existing: [resource("res_stripekey1", "stripe-secret-key", { kind: "secret" }), resource("res_regionvar1", "region", { kind: "variable", value: "x" })] })
    const run = await s.init(["--yes", "--clients", "claude-code", "--skills", "none", "--import-env", ".env", "--json"])
    const report = JSON.parse(run.stdout)
    expect(report.secrets.skipped).toEqual([
      { name: "STRIPE_SECRET_KEY", reason: "already in Smartplane" },
      { name: "REGION", reason: "already in Smartplane" }
    ])
    expect(report.secrets.created.map((c: { name: string }) => c.name)).toEqual(["DATABASE_URL", "SESSION_SIGNING", "VITE_PUBLIC_URL"])
  })

  it("shows the package.json diff and only applies it after a yes", async () => {
    const s = initSetup()
    const declined = await s.init(["--skills", "none"], { answers: { ...interactive, clients: [], "patch-scripts": false } })
    expect(declined.stderr).toContain("-    \"dev\": \"next dev\",")
    expect(declined.stderr).toContain("+    \"dev\": \"smartplane run -- next dev\",")
    expect(json(join(s.cwd, "package.json")).scripts.dev).toBe("next dev")
    expect(declined.stdout).toContain("Replace `npm run dev` with `smartplane run -- npm run dev`.")
  })

  it("refuses to run without a terminal unless --yes, and asks the API nothing", async () => {
    const s = initSetup()
    const run = await s.init([])
    expect(run.exitCode).toBe(2)
    expect(run.stderr).toContain("Pass --yes")
    expect(run.requests).toEqual([])
  })

  it("prints a machine-readable summary with --json", async () => {
    const s = initSetup()
    const run = await s.init(["--yes", "--json", "--project", "api", "--clients", "claude-code", "--skills", "local", "--hook", "--import-env", ".env", "--patch-scripts"])
    expect(run.exitCode).toBe(0)
    const report = JSON.parse(run.stdout)
    expect(report.steps.map((step: { step: string; status: string }) => `${step.step}:${step.status}`)).toEqual([
      "sign-in:unchanged", "project:done", "clients:done", "skills:done", "secrets:done", "verify:done"
    ])
    expect(report.identity).toEqual({ as: "ada@acme.test", org: "Acme", profile: "default", apiUrl: "https://app.smartplane.dev" })
    expect(report.hook).toBe("added")
    expect(report.secrets.created).toHaveLength(5)
    expect(report.secrets.packageScripts).toEqual(["dev"])
    expect(report.verify).toMatchObject({ tools: 2, builtinTools: 3, problems: [] })
    expectNoValues(run.stdout + run.stderr)
  })
})
