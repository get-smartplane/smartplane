import { describe, expect, it } from "vitest"
import { at, githubKey, orgId, prodDb, resource, userId } from "../../testing/fixtures"
import { runCli } from "../../testing/run-cli"

const env = { SMARTPLANE_TOKEN: "pc_test" }
const stripe = resource("res_stripe0001", "STRIPE_KEY", { kind: "secret" })
const machineToken = {
  id: "mtk_test00001",
  orgId,
  name: "api-prod",
  prefix: "pcm_ab12",
  projectId: null,
  allow: [stripe.id],
  createdBy: userId,
  createdAt: at,
  expiresAt: "2026-11-22T09:30:00.000Z",
  lastUsedAt: null,
  lastUsedIp: null,
  revokedAt: null
}
const routes = {
  "GET /api/machine-tokens": { body: [machineToken] },
  "GET /api/resources": { body: [stripe, githubKey, prodDb] },
  "POST /api/lookup": { body: { entries: [{ kind: "resource", id: stripe.id, label: "STRIPE_KEY", detail: null, gone: false }] } }
}
const cli = (args: ReadonlyArray<string>, extra = {}) => runCli(["machine-tokens", ...args], { env, routes: { ...routes, ...extra } })

describe("smartplane machine-tokens", () => {
  it("lists tokens with allowed names", async () => {
    const result = await cli(["ls"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("api-prod")
    expect(result.stdout).toContain("STRIPE_KEY")
  })

  it("creates a token from resource and env names and prints it once, alone on stdout", async () => {
    const result = await cli(["create", "--name", "api-prod", "--allow", "STRIPE_KEY,GITHUB_KEY", "--expires", "30d"], {
      "POST /api/machine-tokens": { status: 201, body: { token: machineToken, plaintext: "pcm_secret_value", deliverUrl: "https://app.smartplane.test/api/secrets/deliver" } }
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("pcm_secret_value")
    expect(result.stderr).toContain("will not be shown again")
    expect(result.requests.find((r) => r.method === "POST")?.body).toEqual({
      name: "api-prod",
      allow: [stripe.id, githubKey.id],
      ttlDays: 30
    })
  })

  const createdReply = { status: 201, body: { token: machineToken, plaintext: "pcm_secret_value", deliverUrl: "https://app.smartplane.dev/api/secrets/deliver" } }

  it("prints the agent prompt on stderr, without the token, and the token alone on stdout", async () => {
    const result = await cli(["create", "--name", "api-prod", "--allow", "STRIPE_KEY", "--platform", "cloudflare-workers"], { "POST /api/machine-tokens": createdReply })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("pcm_secret_value")
    expect(result.stderr).toContain(
      "Use the smartplane skill to set up this service with Smartplane secrets. The machine token is in the SMARTPLANE_TOKEN environment variable (service: api-prod, platform: Cloudflare Workers)"
    )
    expect(result.stderr).toContain("export SMARTPLANE_TOKEN=<the token printed below>")
    expect(result.stderr).not.toContain("pcm_secret_value")
  })

  it("defaults the prompt's platform to detect it, and names a self-hosted API", async () => {
    const result = await cli(["create", "--name", "api-prod", "--allow", "STRIPE_KEY"], {
      "POST /api/machine-tokens": { ...createdReply, body: { ...createdReply.body, deliverUrl: "https://sp.acme.dev/api/secrets/deliver" } }
    })
    expect(result.stderr).toContain("(service: api-prod, platform: detect it, api: https://sp.acme.dev)")
  })

  it("includes the prompt as agentPrompt with --json; the token appears only as plaintext", async () => {
    const result = await cli(["create", "--name", "api-prod", "--allow", "STRIPE_KEY", "--platform", "fly", "--json"], { "POST /api/machine-tokens": createdReply })
    expect(result.exitCode).toBe(0)
    const parsed: { plaintext: string; agentPrompt: string; token: { id: string } } = JSON.parse(result.stdout)
    expect(parsed.plaintext).toBe("pcm_secret_value")
    expect(parsed.token.id).toBe(machineToken.id)
    expect(parsed.agentPrompt).toContain("(service: api-prod, platform: Fly.io)")
    expect(result.stdout.split("pcm_secret_value").length - 1).toBe(1)
    expect(result.stderr).not.toContain("pcm_secret_value")
  })

  it("rejects an unknown --platform before calling the API", async () => {
    const result = await cli(["create", "--name", "api-prod", "--allow", "STRIPE_KEY", "--platform", "heroku"])
    expect(result.exitCode).toBe(2)
    expect(result.requests).toEqual([])
  })

  it("rejects an unknown --allow name before creating anything", async () => {
    const result = await cli(["create", "--name", "x", "--allow", "NOPE"])
    expect(result.exitCode).toBe(1)
    expect(result.requests.some((r) => r.method === "POST" && r.path === "/api/machine-tokens")).toBe(false)
  })

  it("renews by name", async () => {
    const result = await cli(["renew", "api-prod", "--expires", "2w"], {
      "POST /api/machine-tokens/mtk_test00001/renew": { body: { ...machineToken, expiresAt: "2026-12-31T00:00:00.000Z" } }
    })
    expect(result.exitCode).toBe(0)
    expect(result.requests.at(-1)?.body).toEqual({ ttlDays: 14 })
    expect(result.stdout).toContain("Renewed api-prod")
  })

  it("rejects a past or too distant expiry before calling the API", async () => {
    for (const value of ["2020-01-01", "91d", "12h"]) {
      const result = await cli(["renew", "api-prod", "--expires", value])
      expect(result.exitCode).toBe(2)
      expect(result.requests).toEqual([])
    }
  })

  it("revokes by prefix", async () => {
    const result = await cli(["revoke", "pcm_ab12"], { "DELETE /api/machine-tokens/mtk_test00001": { status: 204 } })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe("Revoked mtk_test00001.")
  })
})
