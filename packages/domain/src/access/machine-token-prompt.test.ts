import { describe, expect, it } from "vitest"
import { agentSetupPrompt } from "./machine-token-prompt"

describe("agentSetupPrompt", () => {
  it("carries the token only when it is pasted", () => {
    expect(agentSetupPrompt({ service: "billing-api", platform: "vercel", token: "pcm_abc" })).toBe(
      "Use the smartplane skill to set up this service with Smartplane secrets. Machine token: pcm_abc (service: billing-api, platform: Vercel)"
    )
    const env = agentSetupPrompt({ service: "billing-api" })
    expect(env).toBe(
      "Use the smartplane skill to set up this service with Smartplane secrets. The machine token is in the SMARTPLANE_TOKEN environment variable (service: billing-api, platform: detect it)"
    )
    expect(env).not.toContain("pcm_")
  })

  it("names the API only when it is not the hosted one", () => {
    expect(agentSetupPrompt({ service: "s", apiUrl: "https://app.smartplane.dev" })).not.toContain("api:")
    expect(agentSetupPrompt({ service: "s", platform: "cloudflare-workers", apiUrl: "https://sp.acme.dev" })).toContain(
      "(service: s, platform: Cloudflare Workers, api: https://sp.acme.dev)"
    )
  })
})
