import { EnvName, OrgId, ResourceId, type Resource, UserId } from "@pc/domain"
import { DateTime } from "effect"
import { describe, expect, it } from "vitest"
import { allowedEnvNames, listNames } from "./setup/allowed-env-names"
import { apiUrlOf, dashboardAgentPrompt, setupGuides } from "./setup-snippets"

const token = "pcm_test_plaintext_value"
const hosted = "https://app.smartplane.dev/api/secrets/deliver"
const selfHosted = "https://sp.acme.dev/api/secrets/deliver"
const guide = (id: string, deliverUrl = hosted) => {
  const found = setupGuides(token, deliverUrl).find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`no ${id} guide`)
  return { ...found, text: found.blocks.map((block) => block.code).join("\n") }
}

describe("setup guides", () => {
  it("has one tab per platform, in order", () => {
    expect(setupGuides(token, hosted).map((g) => g.label)).toEqual(["Railway", "Vercel", "Cloudflare Workers", "Fly.io", "Docker", "Node SDK"])
  })

  it("Railway: the variable and the wrapped start command", () => {
    const { text } = guide("railway")
    expect(text).toContain(`SMARTPLANE_TOKEN=${token}`)
    expect(text).toContain(`railway variable set SMARTPLANE_TOKEN=${token}`)
    expect(text).toContain("smartplane run --purpose boot -- <your start command>")
  })

  it("Vercel: env add prompts for the value, the SDK loads at cold start, and the build wrap is optional", () => {
    const { text, notes } = guide("vercel")
    expect(text).toContain("vercel env add SMARTPLANE_TOKEN production")
    expect(text).not.toContain(token)
    expect(text).toContain("export const secretsReady = loadSecrets()")
    expect(text).toContain("smartplane run -- next build")
    expect(notes.join(" ")).toMatch(/coming soon/)
    expect(text).not.toMatch(/npm (i|install)|bun add/)
  })

  it("Cloudflare Workers: wrangler secret put, env not process.env, a per-isolate cache", () => {
    const { text, notes } = guide("cloudflare-workers")
    expect(text).toContain("npx wrangler secret put SMARTPLANE_TOKEN")
    expect(text).toContain("secrets.get({ token: env.SMARTPLANE_TOKEN })")
    expect(text).toContain("createSecretsCache")
    expect(text).not.toContain("process.env")
    expect(text).not.toContain(token)
    expect(notes.join(" ")).toMatch(/coming soon/)
  })

  it("Fly.io: fly secrets set and a wrapped process", () => {
    const { text } = guide("fly")
    expect(text).toContain(`fly secrets set SMARTPLANE_TOKEN=${token}`)
    expect(text).toContain(`app = "smartplane run --purpose boot -- <your start command>"`)
  })

  it("Docker: the token goes in at run time, never into the image", () => {
    const { text } = guide("docker")
    expect(text).toContain(`CMD ["smartplane", "run", "--purpose", "boot", "--", "node", "server.js"]`)
    expect(text).toContain("docker run -e SMARTPLANE_TOKEN your-image")
    expect(text).not.toMatch(/^(ENV|ARG) /m)
  })

  it("Node SDK: no install line while the package is unpublished", () => {
    const { text, notes } = guide("node")
    expect(text).toContain("await loadSecrets()")
    expect(text).not.toMatch(/npm (i|install)|bun add/)
    expect(notes[0]).toMatch(/coming soon/)
  })

  it("adds the API URL only for another deployment", () => {
    expect(apiUrlOf(hosted)).toBeUndefined()
    expect(apiUrlOf(selfHosted)).toBe("https://sp.acme.dev")
    expect(guide("railway", selfHosted).text).toContain("SMARTPLANE_API_URL=https://sp.acme.dev")
    expect(guide("vercel", selfHosted).text).toContain("vercel env add SMARTPLANE_API_URL production --value https://sp.acme.dev")
    expect(guide("cloudflare-workers", selfHosted).text).toContain("apiUrl: env.SMARTPLANE_API_URL")
    expect(guide("railway").text).not.toContain("SMARTPLANE_API_URL")
  })
})

describe("the agent prompt", () => {
  const choice = { service: "billing-api", token, deliverUrl: hosted, platform: undefined }

  it("contains the token only in paste mode", () => {
    const pasted = dashboardAgentPrompt({ ...choice, mode: "paste" })
    expect(pasted).toBe(`Use the smartplane skill to set up this service with Smartplane secrets. Machine token: ${token} (service: billing-api, platform: detect it)`)
    const env = dashboardAgentPrompt({ ...choice, mode: "env", platform: "fly" })
    expect(env).not.toContain(token)
    expect(env).not.toContain("pcm_")
    expect(env).toContain("SMARTPLANE_TOKEN environment variable (service: billing-api, platform: Fly.io)")
  })

  it("names the platform chosen, and a self-hosted API", () => {
    expect(dashboardAgentPrompt({ ...choice, mode: "paste", platform: "cloudflare-workers", deliverUrl: selfHosted })).toContain(
      "(service: billing-api, platform: Cloudflare Workers, api: https://sp.acme.dev)"
    )
  })
})

describe("the note under the prompt", () => {
  const secret = (id: string, name: string, delivery: "deliverable" | "gateway_only", envName?: string): Resource => ({
    id: ResourceId.make(id),
    orgId: OrgId.make("org_testorg01"),
    projectId: null,
    name,
    description: "",
    config: { kind: "secret", delivery, ...(envName ? { envName: EnvName.make(envName) } : {}) },
    createdBy: UserId.make("usr_testuser01"),
    createdAt: DateTime.makeUnsafe(0),
    updatedAt: null
  })

  it("lists only the env names still deliverable", () => {
    const resources = [secret("res_stripe0001", "stripe-key", "deliverable"), secret("res_db00000001", "db", "deliverable", "DATABASE_URL"), secret("res_gw00000001", "root", "gateway_only")]
    const names = allowedEnvNames(resources.map((r) => r.id).concat(ResourceId.make("res_gone000001")), resources)
    expect(names).toEqual(["STRIPE_KEY", "DATABASE_URL"])
    expect(listNames(names)).toBe("STRIPE_KEY and DATABASE_URL")
    expect(listNames(["A", "B", "C"])).toBe("A, B and C")
    expect(listNames([])).toBe("the values it lists")
  })
})
