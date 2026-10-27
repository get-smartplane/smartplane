/** Wire-format (JSON-encoded) records, as the API sends them. Decoding them in tests checks them against the contract. */
export const at = "2026-10-01T09:30:00.000Z"
export const orgId = "org_test00001"
export const userId = "usr_test00001"

export const org = { id: orgId, name: "Acme", slug: "acme", auditRetentionDays: 365, toolSearchThreshold: 40, createdAt: at }

export const me = {
  principal: {
    _tag: "User",
    orgId,
    role: "admin",
    permissions: ["resources:read", "resources:manage", "grants:manage", "audit:read"],
    teamIds: [],
    projectId: null,
    userId,
    membershipId: "mem_test00001",
    email: "ada@acme.test",
    tokenId: "tok_test00001"
  },
  org
}

export const resource = (id: string, name: string, config: Record<string, unknown> = { kind: "variable", value: "x" }) => ({
  id,
  orgId,
  projectId: null,
  name,
  description: "",
  config,
  createdBy: userId,
  createdAt: at,
  updatedAt: null
})

export const github = resource("res_github0001", "github", { kind: "mcp_server", url: "https://mcp.github.test/mcp", transport: "streamable_http" })
export const githubKey = resource("res_githubkey1", "github-key", { kind: "secret" })
export const stagingDb = resource("res_staging001", "db", { kind: "database", engine: "postgres", connectionSecretId: "res_githubkey1", readOnly: true })
export const prodDb = resource("res_prodddb001", "db", { kind: "variable", value: "prod" })

export const team = { id: "team_platform1", orgId, name: "Platform", slug: "platform", directoryGroupId: null, memberCount: 3, createdAt: at }

export const member = (id: string, email: string, status: "active" | "invited" | "deprovisioned", user: string | null) => ({
  id,
  orgId,
  userId: user,
  email,
  name: null,
  role: "member",
  status,
  source: "manual",
  lastSeenAt: null,
  createdAt: at,
  deprovisionedAt: null
})

export const members = [
  member("mem_test00001", "ada@acme.test", "active", userId),
  member("mem_invited01", "bob@acme.test", "invited", null)
]

export const grant = (subject: Record<string, unknown>, resourceId = github.id) => ({
  id: "grt_test00001",
  orgId,
  subject,
  resourceId,
  action: "use",
  conditions: {},
  expiresAt: null,
  createdBy: userId,
  createdAt: at,
  revokedAt: null
})

export const token = {
  id: "tok_test00002",
  orgId,
  kind: "personal",
  name: "smartplane connect cursor",
  prefix: "pc_abcd",
  createdBy: userId,
  projectId: null,
  expiresAt: "2026-12-30T09:30:00.000Z",
  lastUsedAt: null,
  createdAt: at,
  revokedAt: null
}

export const auditEvent = (seq: number) => ({
  id: `evt_test0000${seq}`,
  orgId,
  type: "grant.created",
  actor: { type: "user", id: userId },
  target: { type: "grant", id: "grt_test00001" },
  data: {},
  ip: null,
  userAgent: null,
  requestId: null,
  occurredAt: at,
  seq,
  prevHash: "0".repeat(64),
  hash: String(seq % 10).repeat(64)
})
