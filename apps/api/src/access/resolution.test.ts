import { assert, describe, it } from "@effect/vitest"
import { type Action, type Grant, GrantId, ProjectId, type Resource, ResourceId, RoleSlug, TeamId } from "@pc/domain"
import { DateTime } from "effect"
import { now, orgId, serviceAccountPrincipal, userId, userPrincipal } from "../testing/fixtures"
import { allows, resolveAccess, toolDenials } from "./resolution"

const serverId = ResourceId.make("res_mcpserver1")
const projectA = ProjectId.make("prj_projecta01")
const projectB = ProjectId.make("prj_projectb01")

const server = (overrides: Partial<Resource> = {}): Resource => ({
  id: serverId,
  orgId,
  projectId: null,
  name: "GitHub",
  description: "",
  config: { kind: "mcp_server", url: "https://mcp.example.com", transport: "streamable_http" },
  createdBy: userId,
  createdAt: now,
  updatedAt: null,
  ...overrides
})

let counter = 0
const grant = (action: Action, overrides: Partial<Grant> = {}): Grant => ({
  id: GrantId.make(`grt_testgrant${counter++}`),
  orgId,
  subject: { type: "user", id: userId },
  resourceId: serverId,
  action,
  conditions: {},
  expiresAt: null,
  createdBy: userId,
  createdAt: now,
  revokedAt: null,
  ...overrides
})

describe("grant resolution", () => {
  it("lets higher actions imply lower ones and merges across subjects", () => {
    const principal = userPrincipal({ teamIds: [TeamId.make("team_backend1")] })
    const access = resolveAccess(principal, [
      grant("read"),
      grant("write", { subject: { type: "team", id: TeamId.make("team_backend1") } })
    ], [server()], now)
    const effective = access.get(serverId)
    assert.strictEqual(effective?.action, "write")
    assert.isTrue(allows(effective, "use"))
    assert.isTrue(allows(effective, "read"))
    assert.isFalse(allows(effective, "admin"))
  })

  it("ignores expired, revoked and foreign-subject grants", () => {
    const principal = userPrincipal()
    const access = resolveAccess(principal, [
      grant("admin", { expiresAt: DateTime.subtract(now, { minutes: 1 }) }),
      grant("admin", { expiresAt: now }),
      grant("admin", { revokedAt: now }),
      grant("admin", { subject: { type: "role", role: RoleSlug.make("admin") } })
    ], [server()], now)
    assert.strictEqual(access.size, 0)
    const future = resolveAccess(principal, [grant("use", { expiresAt: DateTime.add(now, { days: 1 }) })], [server()], now)
    assert.isTrue(allows(future.get(serverId), "use"))
  })

  it("applies tool allow-lists only from grants that imply use", () => {
    const principal = userPrincipal()
    const listed = resolveAccess(principal, [grant("use", { conditions: { tools: ["search"] } }), grant("read")], [server()], now)
    assert.deepStrictEqual(toolDenials(listed, serverId, "search"), [])
    assert.deepStrictEqual(toolDenials(listed, serverId, "delete_repo"), [{
      _tag: "ToolNotAllowed",
      resourceId: serverId,
      tool: "delete_repo"
    }])
    const unrestricted = resolveAccess(principal, [grant("use", { conditions: { tools: ["search"] } }), grant("write")], [server()], now)
    assert.deepStrictEqual(toolDenials(unrestricted, serverId, "delete_repo"), [])
  })

  it("requires use to call tools and reports a missing grant", () => {
    const principal = userPrincipal()
    const readOnly = resolveAccess(principal, [grant("read")], [server()], now)
    assert.deepStrictEqual(toolDenials(readOnly, serverId, "search"), [{ _tag: "ActionNotGranted", resourceId: serverId, required: "use" }])
    assert.deepStrictEqual(toolDenials(new Map(), serverId, "search"), [{ _tag: "NoGrant", resourceId: serverId }])
  })

  it("allows a single granted tool resource without a server grant", () => {
    const toolResource: Resource = {
      ...server({ id: ResourceId.make("res_toolsearch1"), name: "search" }),
      config: { kind: "tool", serverId, toolName: "search" }
    }
    const access = resolveAccess(userPrincipal(), [grant("use", { resourceId: toolResource.id })], [server(), toolResource], now)
    assert.deepStrictEqual(toolDenials(access, serverId, "search"), [])
    assert.strictEqual(toolDenials(access, serverId, "other")[0]?._tag, "NoGrant")
  })

  it("hides resources of other projects from project-scoped tokens", () => {
    const scoped = userPrincipal({ projectId: projectA })
    const resources = [
      server(),
      server({ id: ResourceId.make("res_inprojecta"), projectId: projectA }),
      server({ id: ResourceId.make("res_inprojectb"), projectId: projectB })
    ]
    const grants = resources.map((resource) => grant("use", { resourceId: resource.id }))
    assert.deepStrictEqual([...resolveAccess(scoped, grants, resources, now).keys()].sort(), [
      "res_inprojecta",
      "res_mcpserver1"
    ])
    assert.strictEqual(resolveAccess(userPrincipal(), grants, resources, now).size, 3)
  })

  it("gives service accounts only their own grants, not role grants", () => {
    const principal = serviceAccountPrincipal()
    const access = resolveAccess(principal, [grant("use", { subject: { type: "role", role: RoleSlug.make("member") } })], [server()], now)
    assert.strictEqual(access.size, 0)
    if (principal._tag !== "ServiceAccount") return assert.fail("expected a service account")
    const own = resolveAccess(principal, [grant("use", { subject: { type: "service_account", id: principal.tokenId } })], [server()], now)
    assert.isTrue(allows(own.get(serverId), "use"))
  })
})
