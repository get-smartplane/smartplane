import type { AuditEvent } from "@pc/domain"
import { DateTime, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { AuditQueue } from "../platform/audit-queue"
import { sha256Hex } from "../platform/encoding"
import { now, orgId, userId } from "./fixtures"

const at = DateTime.formatIso(now)

export const insertRow = (table: string, row: Record<string, unknown>) =>
  SqlClient.SqlClient.use((sql) => sql`INSERT INTO ${sql(table)} ${sql.insert(row)}`).pipe(Effect.orDie)

export const selectRows = (query: string, ...params: Array<unknown>) =>
  SqlClient.SqlClient.use((sql) => sql.unsafe<Record<string, unknown>>(query, params)).pipe(Effect.orDie)

/** An org with one active member (`userId`, membership `mem_testmem01`) on a team. */
export const seedOrg = Effect.gen(function*() {
  yield* insertRow("orgs", { id: orgId, workosOrgId: "org_workos", name: "Acme", slug: "acme", auditRetentionDays: 365, toolSearchThreshold: 40, createdAt: at })
  yield* seedUser(userId, "ada@example.com", "mem_testmem01")
  yield* insertRow("teams", { id: "team_testteam1", orgId, name: "Backend", slug: "backend", createdAt: at })
  yield* insertRow("team_members", { teamId: "team_testteam1", userId, addedAt: at })
})

export const seedUser = (id: string, email: string, membershipId: string, role = "member") =>
  Effect.gen(function*() {
    yield* insertRow("users", { id, workosUserId: `wos_${id}`, email, name: null, status: "active", createdAt: at })
    yield* insertRow("memberships", {
      id: membershipId,
      orgId,
      userId: id,
      email,
      role,
      status: "active",
      source: "manual",
      createdAt: at
    })
  })

export const seedToken = (
  id: string,
  plaintext: string,
  options: { kind?: "personal" | "service_account"; expiresAt?: DateTime.Utc; membershipId?: string | null } = {}
) =>
  Effect.gen(function*() {
    yield* insertRow("access_tokens", {
      id,
      orgId,
      kind: options.kind ?? "personal",
      name: id,
      prefix: plaintext.slice(0, 10),
      tokenHash: yield* Effect.promise(() => sha256Hex(plaintext)),
      createdBy: userId,
      membershipId: options.membershipId === undefined ? "mem_testmem01" : options.membershipId,
      projectId: null,
      expiresAt: DateTime.formatIso(options.expiresAt ?? DateTime.add(now, { days: 30 })),
      createdAt: at
    })
  })

export const seedResource = (id: string) =>
  insertRow("resources", {
    id,
    orgId,
    kind: "variable",
    name: id,
    description: "",
    config: JSON.stringify({ kind: "variable", value: "eu-west-1" }),
    createdBy: userId,
    createdAt: at
  })

export const seedUserGrant = (id: string, resourceId: string, subjectId: string = userId) =>
  insertRow("grants", {
    id,
    orgId,
    subject: JSON.stringify({ type: "user", id: subjectId }),
    subjectType: "user",
    subjectId,
    resourceId,
    action: "read",
    conditions: "{}",
    createdBy: userId,
    createdAt: at
  })

/** Captures enqueued audit events instead of sending them to a queue. */
export const memoryAuditQueue = (events: Array<AuditEvent>) =>
  Layer.succeed(AuditQueue, { send: (event) => Effect.sync(() => void events.push(event)) })
