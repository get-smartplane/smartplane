import { Email, Unauthorized, UpstreamFailure } from "@pc/domain"
import { WorkOS as WorkOSClient } from "@workos-inc/node"
import { Context, Effect, Layer, Redacted, Schema } from "effect"
import { AppConfig } from "../platform/config"

/** The parts of a WorkOS user we mirror, decoded rather than trusted. */
export const WorkosUser = Schema.Struct({
  id: Schema.NonEmptyString,
  email: Email,
  firstName: Schema.optional(Schema.NullOr(Schema.String)),
  lastName: Schema.optional(Schema.NullOr(Schema.String))
})
export type WorkosUser = typeof WorkosUser.Type

export const displayName = (user: WorkosUser): string | null =>
  [user.firstName, user.lastName].filter((part) => typeof part === "string" && part.length > 0).join(" ") || null

export interface WorkosSession {
  readonly user: WorkosUser
  readonly organizationId: string | undefined
  /** Set when the access token had expired and the session was refreshed: re-set the cookie. */
  readonly refreshed: Redacted.Redacted<string> | undefined
}

export interface CodeExchange {
  readonly user: WorkosUser
  readonly organizationId: string | undefined
  readonly sealedSession: Redacted.Redacted<string>
  readonly authenticationMethod: string | undefined
}

const decodeUser = (user: unknown) =>
  Schema.decodeUnknownEffect(WorkosUser)(user).pipe(
    Effect.mapError(() => new UpstreamFailure({ upstream: "workos", message: "unexpected user shape" }))
  )

/** WorkOS AuthKit, Organizations and webhooks. SDK failures become typed `UpstreamFailure`s. */
export class WorkOS extends Context.Service<WorkOS, {
  readonly authorizationUrl: (options: { readonly signUp: boolean; readonly organizationId?: string | undefined; readonly state: string }) => string
  readonly exchangeCode: (code: string) => Effect.Effect<CodeExchange, UpstreamFailure | Unauthorized>
  readonly authenticate: (sealed: Redacted.Redacted<string>) => Effect.Effect<WorkosSession, Unauthorized>
  /** Re-seals the session scoped to `organizationId` (used after creating an org). */
  readonly switchOrganization: (sealed: Redacted.Redacted<string>, organizationId: string) => Effect.Effect<Redacted.Redacted<string>, UpstreamFailure>
  readonly logoutUrl: (sealed: Redacted.Redacted<string>) => Effect.Effect<string>
  readonly createOrganization: (name: string) => Effect.Effect<string, UpstreamFailure>
  readonly createMembership: (organizationId: string, userId: string, roleSlug: string) => Effect.Effect<string, UpstreamFailure>
  readonly sendInvitation: (organizationId: string, email: string) => Effect.Effect<string, UpstreamFailure>
  readonly verifyWebhook: (rawBody: string, signature: string) => Effect.Effect<boolean>
}>()("api/auth/WorkOS") {
  static readonly layer = Layer.effect(
    WorkOS,
    Effect.gen(function*() {
      const config = yield* AppConfig
      const client = new WorkOSClient(Redacted.value(config.WORKOS_API_KEY), { clientId: config.WORKOS_CLIENT_ID })
      const cookiePassword = Redacted.value(config.WORKOS_COOKIE_PASSWORD)
      const users = client.userManagement
      const call = <A>(operation: string, run: () => Promise<A>) =>
        Effect.tryPromise({ try: run, catch: (cause) => new UpstreamFailure({ upstream: "workos", message: `${operation}: ${String(cause)}` }) })
      const load = (sealed: Redacted.Redacted<string>) => users.loadSealedSession({ sessionData: Redacted.value(sealed), cookiePassword })
      const invalid = new Unauthorized({ reason: "invalid_credentials" })

      const authenticate = Effect.fn("WorkOS.authenticate")(function*(sealed: Redacted.Redacted<string>) {
        const session = load(sealed)
        const current = yield* call("authenticate", () => session.authenticate()).pipe(Effect.mapError(() => invalid))
        if (current.authenticated) {
          return { user: yield* Effect.mapError(decodeUser(current.user), () => invalid), organizationId: current.organizationId, refreshed: undefined }
        }
        // An expired access token is refreshed transparently; anything else means signing in again.
        const refreshed = yield* call("refresh", () => session.refresh({ cookiePassword })).pipe(Effect.mapError(() => invalid))
        if (!refreshed.authenticated || refreshed.sealedSession === undefined) return yield* new Unauthorized({ reason: "expired" })
        return {
          user: yield* Effect.mapError(decodeUser(refreshed.user), () => invalid),
          organizationId: refreshed.organizationId,
          refreshed: Redacted.make(refreshed.sealedSession)
        }
      })

      return WorkOS.of({
        authorizationUrl: ({ signUp, organizationId, state }) =>
          users.getAuthorizationUrl({
            provider: "authkit",
            clientId: config.WORKOS_CLIENT_ID,
            redirectUri: `${config.API_URL}/auth/callback`,
            screenHint: signUp ? "sign-up" : "sign-in",
            state,
            ...(organizationId ? { organizationId } : {})
          }),
        exchangeCode: Effect.fn("WorkOS.exchangeCode")(function*(code: string) {
          const result = yield* call("authenticateWithCode", () =>
            users.authenticateWithCode({ clientId: config.WORKOS_CLIENT_ID, code, session: { sealSession: true, cookiePassword } }))
          if (result.sealedSession === undefined) return yield* invalid
          return {
            user: yield* decodeUser(result.user),
            organizationId: result.organizationId,
            sealedSession: Redacted.make(result.sealedSession),
            authenticationMethod: result.authenticationMethod
          }
        }),
        authenticate,
        switchOrganization: Effect.fn("WorkOS.switchOrganization")(function*(sealed: Redacted.Redacted<string>, organizationId: string) {
          const refreshed = yield* call("refresh", () => load(sealed).refresh({ cookiePassword, organizationId }))
          if (!refreshed.authenticated || refreshed.sealedSession === undefined) {
            return yield* new UpstreamFailure({ upstream: "workos", message: "could not switch the session to the new organization" })
          }
          return Redacted.make(refreshed.sealedSession)
        }),
        logoutUrl: Effect.fn("WorkOS.logoutUrl")((sealed: Redacted.Redacted<string>) =>
          call("logoutUrl", () => load(sealed).getLogoutUrl({ returnTo: config.APP_URL })).pipe(Effect.orElseSucceed(() => config.APP_URL))
        ),
        createOrganization: Effect.fn("WorkOS.createOrganization")((name: string) =>
          call("createOrganization", () => client.organizations.createOrganization({ name })).pipe(Effect.map((org) => org.id))
        ),
        createMembership: Effect.fn("WorkOS.createMembership")((organizationId: string, userId: string, roleSlug: string) =>
          call("createOrganizationMembership", () => users.createOrganizationMembership({ organizationId, userId, roleSlug })).pipe(
            Effect.map((membership) => membership.id)
          )
        ),
        sendInvitation: Effect.fn("WorkOS.sendInvitation")((organizationId: string, email: string) =>
          call("sendInvitation", () => users.sendInvitation({ organizationId, email })).pipe(Effect.map((invitation) => invitation.id))
        ),
        verifyWebhook: Effect.fn("WorkOS.verifyWebhook")((rawBody: string, signature: string) =>
          call("verifyHeader", () =>
            client.webhooks.verifyHeader({ payload: rawBody, sigHeader: signature, secret: Redacted.value(config.WORKOS_WEBHOOK_SECRET) })).pipe(
              Effect.orElseSucceed(() => false)
            )
        )
      })
    })
  )
}
