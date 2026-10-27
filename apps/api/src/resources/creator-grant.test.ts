import { assert, describe, it } from "@effect/vitest"
import { type AuditEvent, type CreateResource, type Grant, PieceId, type Principal, ProjectId, type ResourceId, RoleSlug } from "@pc/domain"
import { DateTime, Effect, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { AccessPolicy } from "../access/access-policy"
import { Grants } from "../access/grants"
import { GrantsRepo } from "../access/grants-repo"
import { now, orgId, userId, userPrincipal } from "../testing/fixtures"
import { resourceServices } from "../testing/resource-world"
import { insertRow, seedOrg } from "../testing/seed"
import { Resources } from "./resources"

const projectA = ProjectId.make("prj_projecta01")
const projectB = ProjectId.make("prj_projectb01")
/** A resources manager without `grants:manage`: the creator grant must not depend on being able to grant. */
const creator = userPrincipal({ role: RoleSlug.make("builder"), permissions: ["resources:read", "resources:manage"] })
const admin = userPrincipal({ role: RoleSlug.make("admin"), permissions: ["resources:read", "resources:manage", "grants:manage"] })

const seed = Effect.gen(function*() {
  yield* TestClock.setTime(now.epochMilliseconds)
  yield* seedOrg
  for (const id of [projectA, projectB]) yield* insertRow("projects", { id, orgId, name: id, slug: id.replace("_", "-"), createdAt: DateTime.formatIso(now) })
})

const create = (input: Omit<CreateResource, "description" | "projectId"> & { projectId?: ProjectId }, principal: Principal = creator) =>
  Resources.use((resources) => resources.create(principal, { description: "", projectId: null, ...input }))
const grantsOn = (resourceId: ResourceId) => GrantsRepo.use((repo) => repo.list(orgId, { resourceId }))
const reachable = (principal: Principal) => Effect.map(AccessPolicy.use((policy) => policy.resolve(principal)), (access) => [...access.keys()])

const assertCreatorGrant = (grants: ReadonlyArray<Grant>, resourceId: ResourceId) => {
  assert.strictEqual(grants.length, 1)
  assert.deepInclude(grants[0], { resourceId, subject: { type: "user", id: userId }, action: "admin", conditions: {}, expiresAt: null, createdBy: userId, revokedAt: null })
}

describe("the creator of a resource gets full access to it", () => {
  it.effect("every usable kind gets exactly one admin grant to its creator, audited with reason creator; a secret gets none", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      const secret = yield* create({ name: "Token", config: { kind: "secret", value: Redacted.make("s3cr3t") } })
      const server = yield* create({ name: "GitHub", config: { kind: "mcp_server", url: "https://gh.example.com/mcp", transport: "streamable_http", auth: { type: "secret", secretId: secret.id } } })
      const usable = [
        server,
        yield* create({ name: "search", config: { kind: "tool", serverId: server.id, toolName: "search" } }),
        yield* create({ name: "CRM", config: { kind: "api", baseUrl: "https://crm.example.com", authSecretId: secret.id } }),
        yield* create({ name: "Warehouse", config: { kind: "database", engine: "postgres", connectionSecretId: secret.id, readOnly: true } }),
        yield* create({ name: "GitHub issues", config: { kind: "integration", pieceId: PieceId.make("github"), connection: { type: "secret_text", secretId: secret.id } } }),
        yield* create({ name: "Release notes", config: { kind: "skill", description: "Write release notes", body: "Summarise the changes." } }),
        yield* create({ name: "region", config: { kind: "variable", value: "eu-west-1" } })
      ]

      assert.deepStrictEqual(yield* grantsOn(secret.id), [])
      const grantEvents = events.filter((event) => event.type === "grant.created")
      assert.strictEqual(grantEvents.length, usable.length)
      for (const resource of usable) {
        const grants = yield* grantsOn(resource.id)
        assertCreatorGrant(grants, resource.id)
        const event = grantEvents.find((candidate) => candidate.target?.id === grants[0]?.id)
        assert.deepStrictEqual(event?.actor, { type: "user", id: userId })
        assert.deepInclude(event?.data, { reason: "creator", resourceId: resource.id, action: "admin", subject: { type: "user", id: userId }, expiresAt: null })
      }
      // Resource first, then the grant on it.
      assert.deepStrictEqual(events.filter((event) => event.target?.id === server.id || event.data.resourceId === server.id).map((event) => event.type), ["resource.created", "grant.created"])
      // The creator's agents can use all of it right away, without anyone granting anything.
      assert.deepStrictEqual((yield* reachable(creator)).sort(), usable.map((resource) => resource.id).sort())
    }).pipe(Effect.provide(resourceServices(events)))
  })

  it.effect("a project-scoped resource's grant reaches it only from that project", () =>
    Effect.gen(function*() {
      yield* seed
      const scoped = yield* create({ name: "staging-url", projectId: projectA, config: { kind: "variable", value: "https://staging" } })
      assertCreatorGrant(yield* grantsOn(scoped.id), scoped.id)
      assert.strictEqual(scoped.projectId, projectA)
      assert.deepStrictEqual(yield* reachable(userPrincipal({ projectId: projectA })), [scoped.id])
      assert.deepStrictEqual(yield* reachable(userPrincipal({ projectId: projectB })), [])
    }).pipe(Effect.provide(resourceServices())))

  it.effect("stays a normal grant: listed like any other, and revocable by an admin", () => {
    const events: Array<AuditEvent> = []
    return Effect.gen(function*() {
      yield* seed
      const variable = yield* create({ name: "region", config: { kind: "variable", value: "eu-west-1" } })
      const [grant] = yield* Grants.use((grants) => grants.list(admin, { resourceId: variable.id }))
      if (grant === undefined) return yield* Effect.die("expected the creator grant")
      // The creator alone cannot revoke it without grants:manage, exactly as for any grant.
      assert.strictEqual((yield* Effect.flip(Grants.use((grants) => grants.revoke(creator, grant.id))))._tag, "Forbidden")
      yield* Grants.use((grants) => grants.revoke(admin, grant.id))
      assert.deepStrictEqual(yield* grantsOn(variable.id), [])
      assert.deepStrictEqual(yield* reachable(creator), [])
      assert.isTrue(events.some((event) => event.type === "grant.revoked" && event.target?.id === grant.id))
    }).pipe(Effect.provide(resourceServices(events)))
  })

  it.effect("a refused creation leaves neither a resource nor a grant", () =>
    Effect.gen(function*() {
      yield* seed
      yield* create({ name: "region", config: { kind: "variable", value: "a" } })
      assert.strictEqual((yield* Effect.flip(create({ name: "region", config: { kind: "variable", value: "b" } })))._tag, "Conflict")
      assert.strictEqual((yield* GrantsRepo.use((repo) => repo.list(orgId, {}))).length, 1)
    }).pipe(Effect.provide(resourceServices())))
})
