import { DeliveredSecrets } from "@pc/domain"
import { Redacted, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { mergeEnvironment, planInjection } from "./plan"

const fromServer = Schema.decodeUnknownSync(Schema.toCodecJson(DeliveredSecrets))
const value = (name: string, kind = "secret") => ({ name, value: `value-of-${name}`, kind, version: "1", resourceId: "res_testres01" })

describe("delivery injection plan", () => {
  it("skips loader variables a compromised server sends, and reports them instead of failing", () => {
    const response = fromServer({
      env: [value("STRIPE_KEY"), value("NODE_OPTIONS"), value("LD_PRELOAD", "variable"), value("PATH", "variable"), value("bash_env"), value("BAD=NAME")],
      denied: [{ name: "BASH_ENV", reason: "policy" }],
      expiresAt: null
    })
    const plan = planInjection(response, undefined, true)
    expect(plan.injected.map((item) => item.name)).toEqual(["STRIPE_KEY"])
    expect(plan.refused).toEqual(["NODE_OPTIONS", "LD_PRELOAD", "PATH", "bash_env", "BAD=NAME"])
    expect(plan.secrets.map((secret) => secret.name)).toEqual(["STRIPE_KEY"])
    const { env } = mergeEnvironment({ PATH: "/usr/bin" }, plan.injected)
    expect(env).toEqual({ PATH: "/usr/bin", STRIPE_KEY: "value-of-STRIPE_KEY" })
    expect(Redacted.value(plan.injected[0]?.value ?? Redacted.make(""))).toBe("value-of-STRIPE_KEY")
  })
})
