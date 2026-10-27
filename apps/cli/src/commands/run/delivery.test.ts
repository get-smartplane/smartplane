import { mkdirSync, readdirSync, readFileSync, statSync, watch } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { apiKey, delivered, deliveryReply, node } from "../../testing/delivery"
import { type CliOptions, runCli, tempDir } from "../../testing/run-cli"

const env = { SMARTPLANE_TOKEN: "pc_test" }
const run = (args: ReadonlyArray<string>, options: CliOptions = {}) =>
  runCli(["run", ...args], { env, ...options, routes: { "POST /api/secrets/deliver": deliveryReply(), ...options.routes } })

const partial = deliveryReply([delivered("API_KEY", apiKey)], [{ name: "STRIPE_LIVE_KEY", reason: "no_grant" }])

describe("names that were not delivered", () => {
  it("reports them in one notice and exits 2 before starting anything", async () => {
    const result = await run(["--only", "API_KEY,STRIPE_LIVE_KEY,NOPE", ...node(`console.log("started")`)], { routes: { "POST /api/secrets/deliver": partial } })
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("smartplane: not delivered: STRIPE_LIVE_KEY (no grant), NOPE (unknown)")
    expect(result.childStdout).toBe("")
  })

  it("runs anyway with --allow-missing, and sets placeholders with --placeholders", async () => {
    const script = `console.log(process.env.STRIPE_LIVE_KEY ?? "unset")`
    const routes = { "POST /api/secrets/deliver": partial }
    const allowed = await run(["--only", "API_KEY,STRIPE_LIVE_KEY", "--allow-missing", ...node(script)], { routes })
    expect(allowed.exitCode).toBe(0)
    expect(allowed.childStdout).toBe("unset\n")
    const placeholders = await run(["--only", "API_KEY,STRIPE_LIVE_KEY", "--allow-missing", "--placeholders", ...node(script)], { routes })
    expect(placeholders.childStdout).toBe("smartplane:denied:STRIPE_LIVE_KEY\n")
  })
})

describe("delivery errors", () => {
  it("maps 401 to exit 3 with a login hint", async () => {
    const result = await run(node(""), { routes: { "POST /api/secrets/deliver": { status: 401, body: { _tag: "Unauthorized", reason: "expired" } } } })
    expect(result.exitCode).toBe(3)
    expect(result.stderr).toContain("smartplane login")
    expect(result.stderr).toContain("SMARTPLANE_TOKEN")
  })

  it("backs off once on 429, honouring Retry-After, then succeeds", async () => {
    let calls = 0
    const routes = {
      "POST /api/secrets/deliver": () => (++calls === 1 ? { status: 429, headers: { "retry-after": "1" }, body: {} } : deliveryReply())
    }
    const started = Date.now()
    const result = await run(node(`console.log("ok")`), { routes })
    expect(result.exitCode).toBe(0)
    expect(calls).toBe(2)
    expect(Date.now() - started).toBeGreaterThanOrEqual(900)
  })

  it("fails after a second 429", async () => {
    const result = await run(node(""), { routes: { "POST /api/secrets/deliver": { status: 429, headers: { "retry-after": "0" }, body: {} } } })
    expect(result.exitCode).toBe(1)
    expect(result.requests).toHaveLength(2)
    expect(result.stderr).toContain("Rate limited")
  })

  it("reads the wait from a RateLimited body when there is no Retry-After header", async () => {
    let calls = 0
    const routes = {
      "POST /api/secrets/deliver": () => (++calls === 1 ? { status: 429, body: { _tag: "RateLimited", retryAfterSeconds: 0 } } : deliveryReply())
    }
    expect((await run(node(""), { routes })).exitCode).toBe(0)
    expect(calls).toBe(2)
  })

  it("rejects --only names that are not env names before calling the API", async () => {
    const result = await run(["--only", "stripe-key", ...node("")])
    expect(result.exitCode).toBe(2)
    expect(result.requests).toEqual([])
  })

  it("warns when the machine token expires within a week", async () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString()
    const routes = { "POST /api/secrets/deliver": { body: { env: [], denied: [], expiresAt: soon } } }
    const result = await runCli(["run", ...node("")], { env: { SMARTPLANE_TOKEN: "pcm_test" }, routes })
    expect(result.stderr).toContain("smartplane machine-tokens renew")
  })

  it("refuses to look up a project by name with a machine token", async () => {
    const result = await runCli(["run", "--project", "api", ...node("")], { env: { SMARTPLANE_TOKEN: "pcm_test" } })
    expect(result.exitCode).toBe(2)
    expect(result.requests).toEqual([])
  })
})

const snapshot = (dir: string): Record<string, string> =>
  Object.fromEntries(readdirSync(dir, { recursive: true, encoding: "utf8" }).map((path) => {
    const full = join(dir, path)
    const stat = statSync(full)
    return [path, stat.isFile() ? `${stat.mtimeMs}:${readFileSync(full, "utf8")}` : "dir"]
  }))

describe("secrets never touch disk", () => {
  it("writes nothing under HOME, the working directory or TMPDIR", async () => {
    const home = tempDir()
    const tmp = join(home, "tmp")
    mkdirSync(tmp)
    const before = snapshot(home)
    const events: Array<string> = []
    const watcher = watch(home, { recursive: true }, (event, file) => events.push(`${event} ${file}`))
    const previousTmp = process.env["TMPDIR"]
    process.env["TMPDIR"] = tmp
    try {
      const result = await run(node(`console.log(process.env.API_KEY)`), { home, cwd: home, env: { ...env, TMPDIR: tmp } })
      expect(result.exitCode).toBe(0)
      expect(result.childStdout).toBe("[smartplane:API_KEY]\n")
      await new Promise((resolve) => setTimeout(resolve, 100))
    } finally {
      watcher.close()
      if (previousTmp === undefined) delete process.env["TMPDIR"]
      else process.env["TMPDIR"] = previousTmp
    }
    expect(events).toEqual([])
    expect(snapshot(home)).toEqual(before)
  })
})
