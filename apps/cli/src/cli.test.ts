import { describe, expect, it } from "vitest"
import { auditEvent, github, githubKey, grant, me, members, prodDb, stagingDb, team, token } from "./testing/fixtures"
import { runCli } from "./testing/run-cli"

const env = { SMARTPLANE_TOKEN: "pc_test" }
const resources = [github, githubKey, stagingDb, prodDb]
const base = {
  "GET /api/me": { body: me },
  "GET /api/resources": { body: resources },
  "GET /api/teams": { body: [team] },
  "GET /api/members": { body: members },
  "POST /api/lookup": { body: { entries: [] } }
}
const cli = (args: ReadonlyArray<string>, routes = {}) => runCli(args, { env, routes: { ...base, ...routes } })

describe("argument parsing and exit codes", () => {
  it.each([
    [["bogus"]],
    [["grants", "add", "--to", "team:platform", "--resource", "github"]],
    [["grants", "add", "--to", "team:platform", "--resource", "github", "--level", "owner"]],
    [["resources", "add", "api", "--name", "x", "--base-url", "https://x.test", "--methods", "GET,FETCH"]],
    [["resources", "add", "mcp-server", "--name", "x", "--url", "not a url"]],
    [["grants", "revoke", "not-a-grant-id"]]
  ])("%j is a usage error (exit 2) without calling the API", async (args) => {
    const run = await cli(args)
    expect(run.exitCode).toBe(2)
    expect(run.requests).toEqual([])
  })

  it("accepts global flags after the subcommand", async () => {
    const run = await cli(["resources", "ls", "--json", "--api-url", "http://localhost:8787"])
    expect(run.exitCode).toBe(0)
    expect(run.requests[0]?.path).toBe("/api/resources")
  })

  it("maps kind spellings and passes filters as query parameters", async () => {
    const run = await cli(["resources", "ls", "--kind", "mcp-server"])
    expect(run.requests[0]?.query).toEqual({ kind: "mcp_server" })
  })

  it("turns domain errors into one-line messages (exit 1)", async () => {
    const run = await cli(["grants", "revoke", "grt_missing001"], {
      "DELETE /api/grants/grt_missing001": { status: 404, body: { _tag: "NotFound", entity: "grant", id: "grt_missing001" } }
    })
    expect(run.exitCode).toBe(1)
    expect(run.stderr).toContain("error: No grant with id grt_missing001.")
  })

  it("names the missing permission on Forbidden", async () => {
    const run = await cli(["members", "invite", "bob@acme.test"], {
      "POST /api/members": { status: 403, body: { _tag: "Forbidden", message: "no", permission: "members:manage" } }
    })
    expect(run.stderr).toContain("\"members:manage\" permission")
  })

  it("will not offboard without confirmation when nobody can answer", async () => {
    const run = await cli(["members", "offboard", "ada@acme.test"])
    expect(run.exitCode).toBe(2)
    expect(run.requests.some((request) => request.method === "DELETE")).toBe(false)
    const confirmed = await cli(["members", "offboard", "ada@acme.test", "--yes"], { "DELETE /api/members/mem_test00001": { body: members[0] } })
    expect(confirmed.exitCode).toBe(0)
  })
})

describe("name to id resolution", () => {
  it("resolves --to and --resource by name and builds the grant payload", async () => {
    const run = await cli(["grants", "add", "--to", "team:platform", "--resource", "github", "--level", "use", "--tools", "a, b", "--expires", "2026-12-31"], {
      "POST /api/grants": { status: 201, body: grant({ type: "team", id: team.id }) }
    })
    expect(run.exitCode).toBe(0)
    expect(run.requests.find((r) => r.method === "POST" && r.path === "/api/grants")?.body).toEqual({
      subject: { type: "team", id: "team_platform1" },
      resourceId: "res_github0001",
      action: "use",
      conditions: { tools: ["a", "b"] },
      expiresAt: "2026-12-31T00:00:00.000Z"
    })
  })

  it("resolves users by email and roles by slug", async () => {
    const post = { "POST /api/grants": { status: 201, body: grant({ type: "role", role: "admin" }) } }
    const byEmail = await cli(["grants", "add", "--to", "user:ADA@acme.test", "--resource", "github", "--level", "read"], post)
    expect(byEmail.requests.find((r) => r.method === "POST" && r.path === "/api/grants")?.body).toMatchObject({ subject: { type: "user", id: "usr_test00001" } })
    const byRole = await cli(["grants", "add", "--to", "role:admin", "--resource", "res_github0001", "--level", "read"], post)
    expect(byRole.requests.map((r) => r.path)).toEqual(["/api/grants", "/api/lookup"])
  })

  it("refuses invited users and ambiguous names with a clear message", async () => {
    const invited = await cli(["grants", "add", "--to", "user:bob@acme.test", "--resource", "github", "--level", "read"])
    expect(invited.stderr).toContain("has not accepted their invitation")
    const ambiguous = await cli(["resources", "rm", "db", "--yes"])
    expect(ambiguous.exitCode).toBe(1)
    expect(ambiguous.stderr).toContain("\"db\" matches 2 resources")
    expect(ambiguous.stderr).toContain("res_staging001")
    expect(ambiguous.stderr).toContain("res_prodddb001")
    expect(ambiguous.requests.some((r) => r.method === "DELETE")).toBe(false)
  })

  it("rejects an unknown subject type as usage", async () => {
    expect((await cli(["grants", "add", "--to", "group:x", "--resource", "github", "--level", "read"])).exitCode).toBe(2)
  })
})

describe("--json output", () => {
  it("prints domain-encoded arrays for list commands", async () => {
    const run = await cli(["resources", "ls", "--json"])
    const parsed = JSON.parse(run.stdout)
    expect(parsed).toHaveLength(4)
    expect(parsed[0]).toEqual(github)
  })

  it("prints grants exactly as the API encodes them", async () => {
    const run = await cli(["grants", "ls", "--json"], { "GET /api/grants": { body: [grant({ type: "team", id: team.id })] } })
    expect(JSON.parse(run.stdout)).toEqual([grant({ type: "team", id: team.id })])
    expect(run.requests.some((r) => r.path === "/api/lookup")).toBe(false)
  })

  it("prints whoami with its token source", async () => {
    const parsed = JSON.parse((await cli(["whoami", "--json"])).stdout)
    expect(parsed).toMatchObject({ source: "env", principal: me.principal, org: me.org })
  })

  it("prints removals as { id, removed }", async () => {
    const run = await cli(["grants", "revoke", "grt_test00001", "--json"], { "DELETE /api/grants/grt_test00001": { status: 204 } })
    expect(JSON.parse(run.stdout)).toEqual({ id: "grt_test00001", removed: true })
  })

  it("prints the new token's plaintext once, alone on stdout without --json", async () => {
    const created = { token, plaintext: "pc_new_secret", mcpUrl: "https://app.smartplane.dev/mcp" }
    const routes = { "POST /api/tokens": { status: 201, body: created } }
    const human = await cli(["tokens", "create", "--name", "ci", "--ttl", "30d"], routes)
    expect(human.stdout).toBe("pc_new_secret")
    expect(human.requests[0]?.body).toEqual({ name: "ci", kind: "personal", projectId: null, ttlDays: 30 })
    expect(JSON.parse((await cli(["tokens", "create", "--name", "ci", "--json"], routes)).stdout)).toEqual(created)
    expect((await cli(["tokens", "create", "--name", "ci", "--ttl", "120d"], routes)).exitCode).toBe(2)
  })

  it("streams audit events as NDJSON, oldest first", async () => {
    const run = await cli(["audit", "tail", "--json"], { "GET /api/audit": { body: { events: [auditEvent(2), auditEvent(1)], nextCursor: null, prevCursor: 2 } } })
    expect(run.stdout.split("\n").map((line) => JSON.parse(line).seq)).toEqual([1, 2])
  })

  it("fails audit verify on a broken chain (exit 1) after printing the result", async () => {
    const run = await cli(["audit", "verify", "--json"], { "GET /api/audit/verify": { body: { _tag: "Broken", fromSeq: 1, checked: 9, at: 7 } } })
    expect(JSON.parse(run.stdout)).toEqual({ _tag: "Broken", fromSeq: 1, checked: 9, at: 7 })
    expect(run.exitCode).toBe(1)
  })
})

describe("human output", () => {
  it("renders aligned tables", async () => {
    const lines = (await cli(["resources", "ls"])).stdout.split("\n")
    expect(lines[0]).toMatch(/^NAME\s+KIND\s+ID\s+SCOPE\s+TARGET$/)
    expect(lines[1]).toMatch(/^github\s+mcp-server\s+res_github0001\s+org\s+https:\/\/mcp\.github\.test\/mcp \(http\)$/)
  })
})
