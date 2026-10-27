import { Layer } from "effect"
import { Atom } from "effect/reactivity"
import { Lookup } from "@/lib/lookup/lookup"
import { ApiClient } from "./client"
import { BrowserHttpClient } from "./http"
import { AuthSession } from "./session"

/**
 * The app's single Effect runtime. Atoms built from it share one memoised layer per registry,
 * so the HTTP client, API client and lookup batcher are constructed once.
 */
export const runtime = Atom.runtime(
  Layer.mergeAll(Lookup.layer, AuthSession.layer).pipe(Layer.provideMerge(ApiClient.layer), Layer.provide(BrowserHttpClient))
)
