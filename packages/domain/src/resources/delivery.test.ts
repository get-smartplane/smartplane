import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { ResourceConfig } from "./config"
import { deliverability, envNameOf, UpdateDelivery } from "./delivery"
import { EnvName, envNameFromName } from "./delivery-mode"

const decodeConfig = Schema.decodeUnknownSync(ResourceConfig)
const resource = (name: string, config: unknown) => ({ name, config: decodeConfig(config) })

describe("secret delivery settings", () => {
  it("decodes rows stored before delivery existed, unchanged and gateway-only", () => {
    const secret = decodeConfig({ kind: "secret" })
    expect(secret).toEqual({ kind: "secret" })
    expect(deliverability(secret)).toBe("gateway_only")
    expect(decodeConfig({ kind: "variable", value: "eu-west-1" })).toEqual({ kind: "variable", value: "eu-west-1" })
    expect(Schema.encodeSync(Schema.toCodecJson(ResourceConfig))(secret)).toEqual({ kind: "secret" })
  })

  it("is decided in one place: deliverable secrets and every variable, nothing else", () => {
    expect(deliverability(decodeConfig({ kind: "secret", delivery: "deliverable" }))).toBe("deliverable")
    expect(deliverability(decodeConfig({ kind: "secret", delivery: "gateway_only" }))).toBe("gateway_only")
    expect(deliverability(decodeConfig({ kind: "variable", value: "x" }))).toBe("deliverable")
    expect(deliverability(decodeConfig({ kind: "mcp_server", url: "https://m.example.com", transport: "sse" }))).toBe("gateway_only")
    expect(() => decodeConfig({ kind: "secret", delivery: "proxy_only" })).toThrow()
  })

  it("validates env names", () => {
    const valid = Schema.is(EnvName)
    for (const name of ["STRIPE_KEY", "_X", "A1", "A".repeat(128)]) expect(valid(name), name).toBe(true)
    for (const name of ["stripe_key", "1A", "", "A-B", "A B", "A".repeat(129)]) expect(valid(name), name).toBe(false)
    expect(() => decodeConfig({ kind: "secret", envName: "bad-name" })).toThrow()
    expect(() => Schema.decodeUnknownSync(UpdateDelivery)({ envName: "nope" })).toThrow()
    expect(Schema.decodeUnknownSync(UpdateDelivery)({ envName: null })).toEqual({ envName: null })
  })

  it("refuses names that change how processes load code, so admins cannot set them", () => {
    const valid = Schema.is(EnvName)
    for (const name of ["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES", "BASH_ENV", "ENV", "PATH", "PYTHONPATH", "PYTHONSTARTUP", "PERL5OPT", "RUBYOPT", "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "GIT_SSH_COMMAND", "PROMPT_COMMAND", "GIT_CONFIG_COUNT", "NPM_CONFIG_SCRIPT_SHELL"]) {
      expect(valid(name), name).toBe(false)
    }
    for (const name of ["NODE_ENV", "PATHNAME", "ENVIRONMENT", "LDAP_URL", "GIT_TOKEN", "DATABASE_URL"]) expect(valid(name), name).toBe(true)
    expect(() => decodeConfig({ kind: "secret", envName: "NODE_OPTIONS" })).toThrow("changes how processes load code")
    expect(() => Schema.decodeUnknownSync(UpdateDelivery)({ envName: "LD_PRELOAD" })).toThrow()
    // A resource named "path" has no safe derived name, so it is never delivered as PATH.
    expect(envNameFromName("path")).toBeUndefined()
  })

  it("derives the env name from the resource name unless one is set", () => {
    expect(envNameFromName("stripe-key")).toBe("STRIPE_KEY")
    expect(envNameFromName("  Database URL (prod) ")).toBe("DATABASE_URL_PROD")
    expect(envNameFromName("2fa seed")).toBe("_2FA_SEED")
    expect(envNameFromName("🔑")).toBeUndefined()
    expect(envNameOf(resource("stripe-key", { kind: "secret" }))).toBe("STRIPE_KEY")
    expect(envNameOf(resource("stripe-key", { kind: "secret", envName: "STRIPE_SECRET_KEY" }))).toBe("STRIPE_SECRET_KEY")
    expect(envNameOf(resource("region", { kind: "variable", value: "x", envName: "AWS_REGION" }))).toBe("AWS_REGION")
  })
})
