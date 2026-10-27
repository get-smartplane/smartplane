import { ForbiddenError, SmartplaneError, UnauthorizedError } from "./errors.js"
import { loadSecrets, type LoadSecretsOptions } from "./load.js"

/** What every `get` may vary: in a Worker the token arrives with each request's `env`, not at module load. */
export type CachedLoadOptions = Pick<LoadSecretsOptions, "token" | "apiUrl" | "names" | "projectId" | "retries" | "fetch">

export interface SecretsCacheOptions extends CachedLoadOptions {
  /** How long fetched values are reused before the next `get` fetches again. Default 5 minutes, minimum 1 second. */
  readonly maxAgeMs?: number
  /** A refetch failed and the previous values are served instead (never for 401/403). */
  readonly onError?: (error: SmartplaneError) => void
}

export interface SecretsCache {
  /** The values, fetched on the first call and again once they are older than `maxAgeMs`. */
  readonly get: (options?: CachedLoadOptions) => Promise<Readonly<Record<string, string>>>
  /** Forgets the values, so the next `get` fetches. */
  readonly clear: () => void
}

const defaultMaxAgeMs = 5 * 60_000

/**
 * An in-memory cache for runtimes with no start command and no `process.env` to fill, such as Cloudflare
 * Workers and other edge functions. Create it at module scope and call `get` inside the handler, where `env`
 * (and network I/O) is available. It uses `loadSecrets` with `target: "none"`, so it never touches `process`.
 *
 * Values live only as long as the isolate does; Cloudflare may evict an isolate at any time, so the cache is
 * an optimisation, never a guarantee. In-flight requests are deliberately not shared between callers: in
 * Workers a promise created by one request cannot safely be awaited by another once the first has ended.
 */
export const createSecretsCache = (options: SecretsCacheOptions = {}): SecretsCache => {
  const maxAgeMs = Math.max(options.maxAgeMs ?? defaultMaxAgeMs, 1_000)
  let cached: { readonly key: string; readonly at: number; readonly env: Readonly<Record<string, string>> } | undefined

  const get = async (overrides: CachedLoadOptions = {}) => {
    const call = { ...options, ...overrides }
    // The key holds the token, in memory only, so a different token never sees another token's values.
    const key = JSON.stringify([call.token ?? "", call.apiUrl ?? "", call.names ?? [], call.projectId ?? ""])
    const now = Date.now()
    if (cached !== undefined && cached.key === key && now - cached.at < maxAgeMs) return cached.env
    try {
      const { env } = await loadSecrets({ ...pick(call), target: "none" })
      cached = { key, at: Date.now(), env: Object.freeze({ ...env }) }
      return cached.env
    } catch (error) {
      const rejected = error instanceof UnauthorizedError || error instanceof ForbiddenError
      if (rejected || !(error instanceof SmartplaneError) || cached === undefined || cached.key !== key) {
        // A revoked or expired token must stop the values being served.
        if (rejected) cached = undefined
        throw error
      }
      options.onError?.(error)
      return cached.env
    }
  }

  return { get, clear: () => (cached = undefined) }
}

const pick = (call: CachedLoadOptions): CachedLoadOptions => ({
  ...(call.token === undefined ? {} : { token: call.token }),
  ...(call.apiUrl === undefined ? {} : { apiUrl: call.apiUrl }),
  ...(call.names === undefined ? {} : { names: call.names }),
  ...(call.projectId === undefined ? {} : { projectId: call.projectId }),
  ...(call.retries === undefined ? {} : { retries: call.retries }),
  ...(call.fetch === undefined ? {} : { fetch: call.fetch })
})
