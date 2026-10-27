import { type AdminPortalIntent, UpstreamFailure } from "@pc/domain"
import { WorkOS as WorkOSClient } from "@workos-inc/node"
import { Context, Effect, Layer, Redacted, Schema } from "effect"
import { AppConfig } from "../platform/config"

const PortalLink = Schema.Struct({ link: Schema.String.check(Schema.isPattern(/^https:\/\/\S+$/)) })

/** WorkOS Organization administration: the Admin Portal and mirroring org settings. */
export class WorkosAdmin extends Context.Service<WorkosAdmin, {
  /** A one-time Admin Portal URL scoped to one organization and intent. */
  readonly portalLink: (organizationId: string, intent: AdminPortalIntent) => Effect.Effect<string, UpstreamFailure>
  readonly renameOrganization: (organizationId: string, name: string) => Effect.Effect<void, UpstreamFailure>
}>()("api/settings/WorkosAdmin") {
  static readonly layer = Layer.effect(
    WorkosAdmin,
    Effect.gen(function*() {
      const config = yield* AppConfig
      const client = new WorkOSClient(Redacted.value(config.WORKOS_API_KEY), { clientId: config.WORKOS_CLIENT_ID })
      const call = <A>(operation: string, run: () => Promise<A>) =>
        Effect.tryPromise({ try: run, catch: (cause) => new UpstreamFailure({ upstream: "workos", message: `${operation}: ${String(cause)}` }) })
      const unexpected = new UpstreamFailure({ upstream: "workos", message: "unexpected admin portal response" })

      return WorkosAdmin.of({
        portalLink: Effect.fn("WorkosAdmin.portalLink")(function*(organizationId: string, intent: AdminPortalIntent) {
          yield* Effect.annotateCurrentSpan({ "workos.portal_intent": intent })
          const response = yield* call("generateLink", () =>
            client.adminPortal.generateLink({ organization: organizationId, intent, returnUrl: `${config.APP_URL}/settings` }))
          // The URL is a bearer credential for the portal: decode it, but never log or trace it.
          return yield* Schema.decodeUnknownEffect(PortalLink)(response).pipe(
            Effect.map((portal) => portal.link),
            Effect.mapError(() => unexpected)
          )
        }),
        renameOrganization: Effect.fn("WorkosAdmin.renameOrganization")((organizationId: string, name: string) =>
          call("updateOrganization", () => client.organizations.updateOrganization({ organization: organizationId, name })).pipe(Effect.asVoid)
        )
      })
    })
  )
}
