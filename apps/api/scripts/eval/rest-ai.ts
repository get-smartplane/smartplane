import { UpstreamFailure } from "@pc/domain"
import { Effect, Layer } from "effect"
import { WorkersAi } from "../../src/platform/ai"

/** Workers AI over the REST API, for scripts: the same `WorkersAi` service the Worker uses with its binding. */
export const restAi = (account: string, token: string) =>
  Layer.succeed(WorkersAi, {
    run: (name, input) =>
      Effect.tryPromise({
        try: async () => {
          for (let attempt = 0; ; attempt++) {
            const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${name}`, {
              method: "POST",
              headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
              body: JSON.stringify(input)
            })
            const body: { result?: unknown; errors?: unknown } = await response.json()
            // Rate limits and capacity errors are retried a few times; anything else fails the call.
            if (response.ok) return body.result
            if (attempt >= 3 || (response.status !== 429 && response.status < 500)) throw new Error(JSON.stringify(body.errors))
            await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)))
          }
        },
        catch: (cause) => new UpstreamFailure({ upstream: "workers-ai", message: String(cause) })
      })
  })
