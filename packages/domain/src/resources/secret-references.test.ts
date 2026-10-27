import { describe, expect, it } from "vitest"
import { ResourceId } from "../ids"
import { PieceId } from "../integrations/names"
import { secretReferences } from "./secret-references"

const a = ResourceId.make("res_secreta001")
const b = ResourceId.make("res_secretb001")

describe("secretReferences", () => {
  it("finds every secret a stored config uses, and none for kinds that cannot hold one", () => {
    expect(secretReferences({ kind: "mcp_server", url: "https://x.test/mcp", transport: "sse", auth: { type: "secret", secretId: a } })).toEqual([a])
    expect(secretReferences({ kind: "mcp_server", url: "https://x.test/mcp", transport: "sse", auth: { type: "oauth", clientId: "c", clientSecretId: a } })).toEqual([a])
    expect(secretReferences({ kind: "mcp_server", url: "https://x.test/mcp", transport: "sse", accountMode: "per_user", auth: { type: "secret" } })).toEqual([])
    expect(secretReferences({ kind: "api", baseUrl: "https://x.test", authSecretId: a })).toEqual([a])
    expect(secretReferences({ kind: "database", engine: "postgres", connectionSecretId: a, readOnly: true })).toEqual([a])
    expect(secretReferences({ kind: "integration", pieceId: PieceId.make("slack"), connection: { type: "oauth2", clientId: "c", clientSecretId: a, status: "connected", tokenSecretId: b } })).toEqual([a, b])
    expect(secretReferences({ kind: "integration", pieceId: PieceId.make("github"), connection: { type: "secret_text", secretId: a } })).toEqual([a])
    expect(secretReferences({ kind: "skill", source: "github", description: "", repo: "acme/skills", tokenSecretId: a })).toEqual([a])
    expect(secretReferences({ kind: "variable", value: "x" })).toEqual([])
    expect(secretReferences({ kind: "secret" })).toEqual([])
  })
})
