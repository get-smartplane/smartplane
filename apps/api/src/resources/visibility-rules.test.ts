import { assert, describe, it } from "@effect/vitest"
import type { ResourceConfig } from "@pc/domain"
import type { EffectiveAccess } from "../access/resolution"
import { userPrincipal } from "../testing/fixtures"
import { grantOf, resourceOf } from "../testing/gateway-fakes"
import { canSee, grantedVisibility } from "./visibility"

const server = resourceOf("res_githubsrv1", "GitHub", { kind: "mcp_server", url: "https://gh.example.com/mcp", transport: "streamable_http" })
const tool = (id: string, toolName: string) => resourceOf(id, toolName, { kind: "tool", serverId: server.id, toolName } satisfies ResourceConfig)
const search = tool("res_ghsearch01", "search")
const remove = tool("res_ghdelete01", "delete_repo")

describe("grant-based visibility rules", () => {
  it("a server grant shows only the tool resources its allow-list lets the member call", () => {
    const access: EffectiveAccess = new Map([[server.id, grantOf(server, "use", { tools: ["search"] })]])
    const visibility = grantedVisibility(userPrincipal(), access, [search, remove])
    assert.isTrue(canSee(visibility, server))
    assert.isTrue(canSee(visibility, search))
    assert.isFalse(canSee(visibility, remove))
  })

  it("a granted gateway-only secret is never visible", () => {
    const secret = resourceOf("res_secretkey1", "key", { kind: "secret" })
    const visibility = grantedVisibility(userPrincipal(), new Map([[secret.id, grantOf(secret, "admin")]]), [])
    assert.isFalse(canSee(visibility, secret))
  })

  it("a deliverable secret is visible with a use grant or higher, not with read", () => {
    const secret = resourceOf("res_secretkey1", "key", { kind: "secret", delivery: "deliverable" })
    const withUse = grantedVisibility(userPrincipal(), new Map([[secret.id, grantOf(secret, "use")]]), [])
    const withRead = grantedVisibility(userPrincipal(), new Map([[secret.id, grantOf(secret, "read")]]), [])
    assert.isTrue(canSee(withUse, secret))
    assert.isFalse(canSee(withRead, secret))
  })
})
