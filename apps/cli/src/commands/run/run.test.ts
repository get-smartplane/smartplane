import { describe, expect, it } from "vitest"
import { apiKey, delivered, deliveryReply, node, region } from "../../testing/delivery"
import { type CliOptions, runCli } from "../../testing/run-cli"

const env = { SMARTPLANE_TOKEN: "pc_test", REGION: "us-east-1" }
const run = (args: ReadonlyArray<string>, options: CliOptions = {}) =>
  runCli(["run", ...args], { env, ...options, routes: { "POST /api/secrets/deliver": deliveryReply(), ...options.routes } })

const reversed = (name: string) => `process.env.${name}.split("").reverse().join("")`

describe("smartplane run: environment and process", () => {
  it("injects delivered values over the environment, warns about overrides, and withholds the token", async () => {
    const result = await run(node(`console.log(JSON.stringify({ key: ${reversed("API_KEY")}, region: process.env.REGION, token: process.env.SMARTPLANE_TOKEN ?? null }))`))
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.childStdout)).toEqual({ key: [...apiKey].reverse().join(""), region, token: null })
    expect(result.stderr).toContain("smartplane: overriding variables already set: REGION")
    expect(result.requests[0]).toMatchObject({ method: "POST", path: "/api/secrets/deliver", authorization: "Bearer pc_test", body: { purpose: "run" } })
  })

  it("sends --purpose boot, --only and a project id", async () => {
    const routes = { "POST /api/secrets/deliver": deliveryReply([delivered("API_KEY", apiKey)]) }
    const result = await run(["--purpose", "boot", "--only", "API_KEY", "--project", "prj_abcdefgh", ...node("")], { routes })
    expect(result.requests[0]?.body).toEqual({ purpose: "boot", names: ["API_KEY"], projectId: "prj_abcdefgh" })
  })

  it("passes the child's exit code through", async () => {
    expect((await run(node("process.exit(7)"))).exitCode).toBe(7)
  })

  it("forwards SIGTERM to a child that traps it", async () => {
    const script = `process.on("SIGTERM", () => { console.log("got SIGTERM"); process.exit(42) }); console.log("ready"); setInterval(() => {}, 1000)`
    const result = await run(node(script), { child: { onStdout: (text, signal) => text.includes("ready") && signal("SIGTERM") } })
    expect(result.childStdout).toContain("got SIGTERM")
    expect(result.exitCode).toBe(42)
  })

  it("exits 128+n when a signal kills the child", async () => {
    const result = await run(node(`console.log("ready"); setInterval(() => {}, 1000)`), {
      child: { onStdout: (text, signal) => text.includes("ready") && signal("SIGTERM") }
    })
    expect(result.exitCode).toBe(128 + 15)
  })

  it("passes stdin through", async () => {
    const script = `let s = ""; process.stdin.on("data", (d) => s += d).on("end", () => console.log(s.toUpperCase()))`
    expect((await run(node(script), { child: { stdin: "hello\nworld" } })).childStdout).toBe("HELLO\nWORLD\n")
  })

  it("reports a missing command with exit 127", async () => {
    const result = await run(["--", "smartplane-no-such-command"])
    expect(result.exitCode).toBe(127)
    expect(result.stderr).toContain("command not found")
  })

  it("needs a command unless --dry-run", async () => {
    const result = await run([])
    expect(result.exitCode).toBe(2)
    expect(result.requests).toEqual([])
  })
})

describe("smartplane run: scrubbing", () => {
  it("scrubs secrets (raw, base64, url-encoded, JSON) from stdout and stderr, not variables", async () => {
    const script = [
      `const k = process.env.API_KEY`,
      `console.log("raw", k, "b64", Buffer.from(k).toString("base64url"), "url", encodeURIComponent(k))`,
      `console.error(JSON.stringify({ k }), process.env.REGION)`
    ].join(";")
    const result = await run(node(script))
    expect(result.childStdout).toBe(`raw [smartplane:API_KEY] b64 [smartplane:API_KEY] url [smartplane:API_KEY]\n`)
    expect(result.childStderr).toBe(`{"k":"[smartplane:API_KEY]"} ${region}\n`)
  })

  it("lists secrets too short to scrub in one notice", async () => {
    const result = await run(node(`console.log(process.env.PIN)`))
    expect(result.stderr).toContain("not scrubbed from output (shorter than 6 characters): PIN")
    expect(result.childStdout).toBe("1234\n")
  })

  it("does not scrub with --no-scrub", async () => {
    const result = await run(["--no-scrub", ...node(`console.log(process.env.API_KEY)`)])
    expect(result.childStdout).toBe(`${apiKey}\n`)
  })
})

describe("smartplane run: dry run", () => {
  it("lists names and kinds, never values, even with --json", async () => {
    for (const extra of [[], ["--json"]]) {
      const result = await run(["--dry-run", ...extra])
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("API_KEY")
      expect(result.stdout).toContain("REGION")
      for (const value of [apiKey, region, "1234"]) expect(result.stdout + result.stderr).not.toContain(value)
      expect(result.childStdout).toBe("")
    }
    const json = JSON.parse((await run(["--dry-run", "--json"])).stdout)
    expect(json.inject).toEqual([{ name: "API_KEY", kind: "secret" }, { name: "REGION", kind: "variable" }, { name: "PIN", kind: "secret" }])
    expect(json.notScrubbed).toEqual(["PIN"])
  })
})
