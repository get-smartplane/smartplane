import type { Overlay } from "./overlay"

/** The Workers that run third-party integration code (Activepieces pieces). */
const runners = ["integrations", "integrations-business"] as const

/**
 * Runners execute third-party piece code, so they must never share a KV namespace with the API: the API
 * caches signing material there (`oauth-jwks:v1:*`), and a piece able to write it could forge `/mcp` tokens.
 * Returns why the overlay is unsafe, one line per shared namespace.
 */
export const sharedNamespaces = (overlay: Overlay): ReadonlyArray<string> => {
  const api = Object.entries(overlay.workers.api.kv ?? {})
  return runners.flatMap((runner) =>
    Object.entries(overlay.workers[runner].kv ?? {}).flatMap(([binding, id]) =>
      api.filter(([, apiId]) => apiId === id).map(([apiBinding]) => `${runner}: KV binding ${binding} uses the api's ${apiBinding} namespace (${id}); give the runners their own namespace`)
    )
  )
}

export const assertIsolated = (overlay: Overlay): void => {
  const problems = sharedNamespaces(overlay)
  if (problems.length > 0) throw new Error(problems.join("\n"))
}
