import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { DenyReason } from "../access/decision"
import { GuardTestCase } from "../access/guard"
import { ResourceId } from "../ids"
import { accountModeOf } from "../resources/account-mode"
import { EditableResourceConfig, ResourceConfig } from "../resources/config"
import { keepPinnedAuthServer } from "./mcp-auth"

const decode = Schema.decodeUnknownSync(ResourceConfig)
const encode = Schema.encodeSync(ResourceConfig)
const decodeInput = Schema.decodeUnknownSync(EditableResourceConfig)
const secretId = "res_secret0001"
const server = { kind: "mcp_server", url: "https://mcp.example.com/mcp", transport: "streamable_http" } as const

describe("MCP server auth", () => {
  it("decodes rows stored with `authSecretId` as a shared bearer secret, and writes them back in the new shape", () => {
    const legacy = decode({ ...server, authSecretId: secretId })
    expect(legacy).toEqual({ ...server, auth: { type: "secret", secretId } })
    expect(encode(legacy)).toEqual({ ...server, auth: { type: "secret", secretId } })
    expect(accountModeOf(legacy)).toBe("shared")
    expect(decode(server)).toEqual(server)
    // The CLI and older dashboards still send `authSecretId`.
    expect(decodeInput({ ...server, authSecretId: secretId })).toEqual({ ...server, auth: { type: "secret", secretId } })
  })

  it("decodes each auth variant, and an explicit `auth` wins over a stale `authSecretId`", () => {
    expect(decode({ ...server, auth: { type: "none" } })).toEqual({ ...server, auth: { type: "none" } })
    expect(decode({ ...server, auth: { type: "secret", secretId, header: "X-Api-Key" } })).toMatchObject({ auth: { header: "X-Api-Key" } })
    const oauth = decode({ ...server, accountMode: "per_user", auth: { type: "oauth", scopes: ["read", "write"] } })
    expect(oauth).toMatchObject({ accountMode: "per_user", auth: { type: "oauth", scopes: ["read", "write"] } })
    expect(decode({ ...server, authSecretId: secretId, auth: { type: "oauth" } })).toEqual({ ...server, auth: { type: "oauth" } })
    expect(() => decode({ ...server, auth: { type: "oauth", scopes: ["bad scope"] } })).toThrow()
    expect(() => decode({ ...server, auth: { type: "basic" } })).toThrow()
  })

  it("requires a shared token's secret and forbids naming one in per-user mode", () => {
    expect(() => decode({ ...server, auth: { type: "secret" } })).toThrow(/shared token needs its secret/)
    expect(() => decode({ ...server, accountMode: "per_user", auth: { type: "secret", secretId } })).toThrow(/each member/)
    expect(decode({ ...server, accountMode: "per_user", auth: { type: "secret" } })).toMatchObject({ accountMode: "per_user" })
  })
})

describe("account modes on APIs and integrations", () => {
  it("defaults to shared and keeps per-user credentials out of the config", () => {
    const api = { kind: "api", baseUrl: "https://api.example.com" } as const
    expect(accountModeOf(decode(api))).toBe("shared")
    expect(accountModeOf(decode({ ...api, accountMode: "per_user" }))).toBe("per_user")
    expect(() => decode({ ...api, accountMode: "per_user", authSecretId: secretId })).toThrow()
    const github = { kind: "integration", pieceId: "github" } as const
    expect(decode({ ...github, connection: { type: "secret_text", secretId } }).kind).toBe("integration")
    expect(() => decode({ ...github, connection: { type: "secret_text" } })).toThrow(/needs its secret/)
    expect(accountModeOf(decode({ ...github, accountMode: "per_user", connection: { type: "secret_text" } }))).toBe("per_user")
    expect(() => decode({ ...github, accountMode: "per_user", connection: { type: "secret_text", secretId } })).toThrow()
    expect(accountModeOf(decode({ kind: "variable", value: "x" }))).toBe("shared")
  })
})

describe("connection context in guards and denials", () => {
  it("lets a guard test carry the account, and a refusal say the account is not connected", () => {
    const sample = Schema.decodeUnknownSync(GuardTestCase)({
      tool: "send_email",
      arguments: {},
      actor: { role: "member", teams: ["sales"] },
      connection: { mode: "shared", accountIdentity: { email: "billing@acme.com" }, connectedBy: { userId: "usr_admin0001", email: "admin@acme.com" } }
    })
    expect(sample.connection?.accountIdentity?.email).toBe("billing@acme.com")
    expect(Schema.decodeUnknownSync(DenyReason)({ _tag: "NotConnected", resourceId: secretId })._tag).toBe("NotConnected")
  })
})

describe("pinned OAuth authorization server", () => {
  const pinned = { type: "oauth", clientId: "admin-client", clientSecretId: ResourceId.make(secretId), issuer: "https://auth.example.com", tokenEndpoint: "https://auth.example.com/token" } as const
  const { issuer: _issuer, tokenEndpoint: _tokenEndpoint, ...unpinned } = pinned

  it("decodes pins as part of the MCP server's OAuth settings", () => {
    expect(decode({ ...server, auth: pinned })).toEqual({ ...server, auth: pinned })
    expect(() => decode({ ...server, auth: { ...pinned, issuer: "not a url" } })).toThrow()
  })

  it("keeps the pins through an admin's edit of the same client, and drops them for another client", () => {
    expect(keepPinnedAuthServer(unpinned, pinned)).toEqual(pinned)
    expect(keepPinnedAuthServer({ ...unpinned, scopes: ["files:read"] }, pinned)).toEqual({ ...pinned, scopes: ["files:read"] })
    expect(keepPinnedAuthServer({ ...unpinned, clientId: "new-client" }, pinned)).toEqual({ ...unpinned, clientId: "new-client" })
    expect(keepPinnedAuthServer({ type: "oauth" }, pinned)).toEqual({ type: "oauth" })
    // An admin who names the server explicitly wins.
    const explicit = { ...unpinned, issuer: "https://login.example.org" }
    expect(keepPinnedAuthServer(explicit, pinned)).toEqual(explicit)
  })
})
