import { readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { me } from "../testing/fixtures"
import { runCli, tempDir } from "../testing/run-cli"

const token = "pc_secret_token_value"
const routes = { "GET /api/me": { body: me } }
const credentialsFile = (home: string) => join(home, ".config", "smartplane", "credentials.json")

describe("login, whoami, logout", () => {
  it("validates the token, then stores it owner-only per profile", async () => {
    const home = tempDir()
    const run = await runCli(["login", "--profile", "work", "--api-url", "http://localhost:8787/"], { home, routes, stdin: `${token}\n` })
    expect(run.exitCode).toBe(0)
    expect(run.requests[0]).toMatchObject({ path: "/api/me", authorization: `Bearer ${token}` })
    expect(statSync(credentialsFile(home)).mode & 0o777).toBe(0o600)
    expect(statSync(join(home, ".config", "smartplane")).mode & 0o777).toBe(0o700)
    const saved = JSON.parse(readFileSync(credentialsFile(home), "utf8"))
    expect(saved.profiles.work).toMatchObject({ apiUrl: "http://localhost:8787", token, org: "Acme", identity: "ada@acme.test" })
    expect(run.stdout + run.stderr).not.toContain(token)

    const whoami = await runCli(["whoami", "--profile", "work"], { home, routes })
    expect(whoami.requests[0]?.authorization).toBe(`Bearer ${token}`)
    expect(whoami.stdout).toContain("ada@acme.test")

    const logout = await runCli(["logout", "--profile", "work"], { home })
    expect(logout.stdout).toContain("Removed profile \"work\"")
    expect(JSON.parse(readFileSync(credentialsFile(home), "utf8")).profiles).toEqual({})
  })

  it("re-tightens permissions on an existing credentials file", async () => {
    const home = tempDir()
    mkdirSync(join(home, ".config", "smartplane"), { recursive: true })
    writeFileSync(credentialsFile(home), JSON.stringify({ version: 1, profiles: {} }), { mode: 0o644 })
    await runCli(["login"], { home, routes, stdin: token })
    expect(statSync(credentialsFile(home)).mode & 0o777).toBe(0o600)
  })

  it("rejects a token the API refuses, without saving it (exit 3)", async () => {
    const home = tempDir()
    const run = await runCli(["login"], { home, stdin: token, routes: { "GET /api/me": { status: 401, body: { _tag: "Unauthorized", reason: "invalid_credentials" } } } })
    expect(run.exitCode).toBe(3)
    expect(run.stderr).toContain("invalid or has been revoked")
    expect(() => readFileSync(credentialsFile(home))).toThrow()
  })

  it("refuses something that is not a pc_ token", async () => {
    expect((await runCli(["login"], { stdin: "hello", routes })).exitCode).toBe(3)
  })

  it("prefers SMARTPLANE_TOKEN over a saved login, for CI", async () => {
    const home = tempDir()
    await runCli(["login"], { home, routes, stdin: token })
    const run = await runCli(["whoami", "--json"], { home, routes, env: { SMARTPLANE_TOKEN: "pc_ci" } })
    expect(run.requests[0]?.authorization).toBe("Bearer pc_ci")
    expect(JSON.parse(run.stdout).source).toBe("env")
  })

  it("says how to log in when there is no token (exit 3)", async () => {
    const run = await runCli(["resources", "ls"])
    expect(run.exitCode).toBe(3)
    expect(run.stderr).toContain("smartplane login")
  })

  it("refuses a corrupt credentials file instead of overwriting it", async () => {
    const home = tempDir()
    mkdirSync(join(home, ".config", "smartplane"), { recursive: true })
    writeFileSync(credentialsFile(home), "{nope")
    const run = await runCli(["login"], { home, routes, stdin: token })
    expect(run.exitCode).toBe(1)
    expect(readFileSync(credentialsFile(home), "utf8")).toBe("{nope")
  })
})
