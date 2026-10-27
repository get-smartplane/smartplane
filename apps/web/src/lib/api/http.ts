import { Layer } from "effect"
import { FetchHttpClient } from "effect/http"

/** Cookies must ride along: the API authenticates the dashboard with its sealed session cookie. */
export const BrowserHttpClient = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" }))
)

/** The API worker is served from the same origin (proxied by Vite in dev, routed in production). */
export const apiOrigin = window.location.origin
