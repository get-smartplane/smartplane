import { describe, expect, it } from "@effect/vitest"
import { Redacted, Schema } from "effect"
import { ResourceConfig } from "./config"
import { CreateResource, Resource } from "./resource"

const decodeConfig = Schema.decodeUnknownSync(ResourceConfig)
const createCodec = Schema.toCodecJson(CreateResource)

describe("resource configs", () => {
  it("decodes each kind by its discriminator", () => {
    const mcp = decodeConfig({ kind: "mcp_server", url: "https://mcp.example.com", transport: "streamable_http" })
    expect(mcp.kind).toBe("mcp_server")
    expect(decodeConfig({ kind: "skill", description: "Summarise", body: "# Steps" }).kind).toBe("skill")
    expect(decodeConfig({ kind: "variable", value: "eu-west-1" })).toEqual({ kind: "variable", value: "eu-west-1" })
    expect(decodeConfig({ kind: "secret" })).toEqual({ kind: "secret" })
  })

  it("rejects unknown kinds and fields of the wrong kind", () => {
    expect(() => decodeConfig({ kind: "printer" })).toThrow()
    expect(() => decodeConfig({ kind: "mcp_server", url: "ftp://x", transport: "sse" })).toThrow()
    expect(() => decodeConfig({ kind: "database", engine: "postgres", readOnly: true })).toThrow()
  })

  it("narrows API resources to allow-listed methods and safe path prefixes", () => {
    const api = decodeConfig({ kind: "api", baseUrl: "https://api.example.com/v1", allowedMethods: ["GET", "POST"], allowedPaths: ["/customers"] })
    expect(api).toMatchObject({ allowedMethods: ["GET", "POST"], allowedPaths: ["/customers"] })
    expect(decodeConfig({ kind: "api", baseUrl: "https://api.example.com" })).not.toHaveProperty("allowedMethods")
    expect(() => decodeConfig({ kind: "api", baseUrl: "https://api.example.com", allowedMethods: ["TRACE"] })).toThrow()
    expect(() => decodeConfig({ kind: "api", baseUrl: "https://api.example.com", allowedMethods: [] })).toThrow()
    for (const prefix of ["customers", "/a/../admin", "/..", "/a?b", "/a%2e%2e", "/a\\b"]) {
      expect(() => decodeConfig({ kind: "api", baseUrl: "https://api.example.com", allowedPaths: [prefix] }), prefix).toThrow()
    }
    expect(() => decodeConfig({ kind: "api", baseUrl: "https://api.example.com", authHeader: "X-Key\r\nHost: evil" })).toThrow()
  })

  it("offers only engines reachable by connection string", () => {
    const secret = "res_secret01"
    expect(decodeConfig({ kind: "database", engine: "mysql", connectionSecretId: secret, readOnly: true }).kind).toBe("database")
    expect(decodeConfig({ kind: "database", engine: "clickhouse", connectionSecretId: secret, readOnly: true }).kind).toBe("database")
    expect(() => decodeConfig({ kind: "database", engine: "d1", connectionSecretId: secret, readOnly: true })).toThrow()
  })

  it("only accepts a secret value at creation, and keeps it redacted", () => {
    const input = Schema.decodeUnknownSync(createCodec)({
      name: "Stripe key",
      description: "",
      projectId: null,
      config: { kind: "secret", value: "sk_live_123" }
    })
    if (input.config.kind !== "secret") throw new Error("expected a secret config")
    expect(Redacted.value(input.config.value)).toBe("sk_live_123")
    expect(String(input.config.value)).not.toContain("sk_live_123")
    expect(Schema.encodeSync(createCodec)(input)).toMatchObject({ config: { kind: "secret", value: "sk_live_123" } })
  })

  it("never carries a secret value on the stored resource", () => {
    const decodeResource = Schema.decodeUnknownSync(Schema.toCodecJson(Resource))
    const row = {
      id: "res_abcdefgh",
      orgId: "org_abcdefgh",
      projectId: null,
      name: "Stripe key",
      description: "",
      config: { kind: "secret", value: "sk_live_123" },
      createdBy: "usr_abcdefgh",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: null
    }
    expect(() => decodeResource(row, { onExcessProperty: "error" })).toThrow()
    expect(decodeResource(row).config).toEqual({ kind: "secret" })
  })
})
