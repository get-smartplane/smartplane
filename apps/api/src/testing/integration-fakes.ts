import { UpstreamFailure } from "@pc/domain"
import { type RunError, type RunOutput, type RunRequest } from "@pc/integrations/rpc"
import { Effect, Layer } from "effect"
import { IntegrationRunner } from "../integrations/runner"
import { OAuthTokens } from "../integrations/oauth/tokens"

/** An integrations Worker that records requests and answers with `respond`. */
export const fakeRunner = (requests: Array<RunRequest>, respond: (request: RunRequest) => Effect.Effect<RunOutput, RunError> = () =>
  Effect.succeed({ output: { ok: true }, truncated: false, ms: 3 })) =>
  Layer.succeed(IntegrationRunner, {
    serves: () => true,
    run: (request) => Effect.suspend(() => (requests.push(request), respond(request)))
  })

export const noRunner = Layer.succeed(IntegrationRunner, IntegrationRunner.none)

/** For connections that are not OAuth2: token access is a test failure. */
export const noOAuthTokens = Layer.succeed(OAuthTokens, {
  current: (app) => Effect.fail(new UpstreamFailure({ upstream: app.resource.name, message: "unexpected OAuth token read" })),
  save: () => Effect.die("unexpected OAuth token write")
})
