import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { initSetup } from "../../testing/init-world"
import { runCli } from "../../testing/run-cli"

const interactive = { project: "prj_api00001", "commit-project": true, clients: [], skills: "local", hook: true }

describe("smartplane init: login and the saved project", () => {
  it("logs in with a pasted token when there is no login yet", async () => {
    const s = initSetup()
    const run = await runCli(["init", "--skills", "none", "--no-import-env"], {
      home: s.home,
      cwd: s.cwd,
      routes: s.world.routes,
      answers: interactive,
      stdin: "pc_pasted_token\n"
    })
    expect(run.exitCode).toBe(0)
    expect(run.requests[0]).toMatchObject({ path: "/api/me", authorization: "Bearer pc_pasted_token" })
    expect(run.stdout).toContain("✓ sign-in  Signed in as ada@acme.test in Acme (profile \"default\")")
    expect(run.stdout + run.stderr).not.toContain("pc_pasted_token")
  })

  it("makes run and skills sync default to the saved project", async () => {
    const s = initSetup()
    await s.init(["--yes", "--project", "api", "--clients", "claude-code", "--skills", "none", "--no-import-env"])
    const dryRun = await runCli(["run", "--dry-run"], { home: s.home, cwd: s.cwd, routes: s.world.routes, env: { SMARTPLANE_TOKEN: "pc_cli" } })
    expect(dryRun.requests[0]?.body).toEqual({ purpose: "run", projectId: "prj_api00001" })
    const sync = await runCli(["skills", "sync", "--dry-run"], { home: s.home, cwd: s.cwd, routes: s.world.routes, env: { SMARTPLANE_TOKEN: "pc_cli" } })
    expect(sync.mcpOpened).toEqual([{ projectId: "prj_api00001" }])
  })

  it("keeps .smartplane/ out of git when the person does not want to commit it", async () => {
    const s = initSetup()
    writeFileSync(join(s.cwd, ".gitignore"), "node_modules")
    await s.init(["--skills", "none", "--no-import-env"], { answers: { ...interactive, "commit-project": false } })
    expect(readFileSync(join(s.cwd, ".gitignore"), "utf8")).toBe("node_modules\n.smartplane/\n")
    expect(readFileSync(join(s.cwd, ".smartplane", "project.json"), "utf8")).toBe(`{\n  "projectId": "prj_api00001"\n}\n`)
  })
})
