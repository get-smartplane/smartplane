import {
  type AccessToken,
  type AccessTokenFilter,
  type AccessTokenId,
  type CreateAccessToken,
  type CreatedAccessToken,
  type Forbidden,
  NotFound,
  type Principal
} from "@pc/domain"
import { Context, DateTime, Effect, Layer, Option, Redacted } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireSession, requireUser, requireWithinProject } from "../auth/permissions"
import { ProjectsRepo } from "../org/projects-repo"
import { AppConfig } from "../platform/config"
import { randomHex, sha256Hex } from "../platform/encoding"
import { Ids } from "../platform/ids"
import { TokenPrefix } from "./token-auth"
import { TokensRepo } from "./tokens-repo"

/** Personal tokens are self-service from a dashboard session; service-account tokens and `scope=all` need `tokens:manage`. */
export class Tokens extends Context.Service<Tokens, {
  readonly list: (principal: Principal, filter: AccessTokenFilter) => Effect.Effect<ReadonlyArray<AccessToken>, Forbidden>
  readonly create: (principal: Principal, input: CreateAccessToken) => Effect.Effect<CreatedAccessToken, Forbidden | NotFound>
  readonly revoke: (principal: Principal, id: AccessTokenId) => Effect.Effect<void, Forbidden | NotFound>
}>()("api/access/Tokens") {
  static readonly layer = Layer.effect(
    Tokens,
    Effect.gen(function*() {
      const tokens = yield* TokensRepo
      const projects = yield* ProjectsRepo
      const config = yield* AppConfig
      const audit = yield* AuditLog

      const list = Effect.fn("Tokens.list")(function*(principal: Principal, filter: AccessTokenFilter) {
        if (filter.scope === "all") {
          yield* requirePermission(principal, "tokens:manage")
          return yield* tokens.list(principal.orgId, null)
        }
        return yield* tokens.list(principal.orgId, (yield* requireUser(principal)).userId)
      })

      const create = Effect.fn("Tokens.create")(function*(principal: Principal, input: CreateAccessToken) {
        const user = yield* requireSession(principal)
        yield* requireWithinProject(principal, input.projectId)
        if (input.kind === "service_account") yield* requirePermission(principal, "tokens:manage")
        if (input.projectId !== null && Option.isNone(yield* projects.find(principal.orgId, input.projectId))) {
          return yield* new NotFound({ entity: "project", id: input.projectId })
        }
        const plaintext = `${TokenPrefix}${randomHex(32)}`
        const now = yield* DateTime.now
        const token: AccessToken = {
          id: yield* Ids.accessToken,
          orgId: principal.orgId,
          kind: input.kind,
          name: input.name,
          prefix: plaintext.slice(0, 10),
          createdBy: user.userId,
          projectId: input.projectId,
          expiresAt: DateTime.add(now, { days: input.ttlDays }),
          lastUsedAt: null,
          createdAt: now,
          revokedAt: null
        }
        // Personal tokens are tied to the creator's membership so they die with it.
        yield* tokens.insert(token, yield* Effect.promise(() => sha256Hex(plaintext)), input.kind === "personal" ? user.membershipId : null)
        yield* audit.by(principal, "token.created", { type: "token", id: token.id }, {
          name: token.name,
          kind: token.kind,
          projectId: token.projectId,
          expiresAt: DateTime.formatIso(token.expiresAt)
        })
        const created: CreatedAccessToken = { token, plaintext: Redacted.make(plaintext), mcpUrl: `${config.API_URL}/mcp` }
        return created
      })

      const revoke = Effect.fn("Tokens.revoke")(function*(principal: Principal, id: AccessTokenId) {
        const owner = principal._tag === "User" && !principal.permissions.includes("tokens:manage") ? principal.userId : null
        if (principal._tag === "ServiceAccount") yield* requirePermission(principal, "tokens:manage")
        if (!(yield* tokens.revoke(principal.orgId, id, owner))) return yield* new NotFound({ entity: "token", id })
        yield* audit.by(principal, "token.revoked", { type: "token", id })
      })

      return Tokens.of({ list, create, revoke })
    })
  )
}
