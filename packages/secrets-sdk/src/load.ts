import { SmartplaneError, UnauthorizedError } from "./errors.js"
import { type FetchLike, requestDelivery } from "./request.js"
import type { DeniedName, Delivery } from "./response.js"

export interface RefreshEvent {
  /** The same object `loadSecrets` returned, already updated. */
  readonly env: Readonly<Record<string, string>>
  /** Names whose value is new or changed. */
  readonly changed: ReadonlyArray<string>
  /** Names no longer delivered (revoked, expired, removed); they are deleted from process.env. */
  readonly removed: ReadonlyArray<string>
}

export interface LoadSecretsOptions {
  /** Default: process.env.SMARTPLANE_TOKEN (a `pcm_` machine token or a `pc_` personal token). */
  readonly token?: string
  /** Default: process.env.SMARTPLANE_API_URL, then https://app.smartplane.dev. */
  readonly apiUrl?: string
  /** Only these names. Requested names that are not delivered are listed in `denied`. */
  readonly names?: ReadonlyArray<string>
  readonly projectId?: string
  /** Where values go. "none" only returns them. Default "process.env". */
  readonly target?: "process.env" | "none"
  /** Replace variables already set in process.env. Default false: what the platform set wins. */
  readonly override?: boolean
  /** Fetch again every this many ms (at least 1000, ±10% jitter) and update values in place. */
  readonly refreshEvery?: number
  readonly onRefresh?: (event: RefreshEvent) => void
  /** A refresh failed; the previous values stay in place. A rejected token stops refreshing. */
  readonly onError?: (error: SmartplaneError) => void
  /** Aborts the first load and stops refreshing. */
  readonly signal?: AbortSignal
  /** Retries for the first load on network errors, 5xx and 429. Default 3. */
  readonly retries?: number
  /** For runtimes or tests that bring their own fetch. */
  readonly fetch?: FetchLike
}

export interface LoadedSecrets {
  /** Every delivered value by name, updated in place on refresh. */
  readonly env: Record<string, string>
  readonly denied: ReadonlyArray<DeniedName>
  readonly expiresAt: string | null
  /** Names the server sent that change how programs load code (e.g. `NODE_OPTIONS`); skipped, never set. */
  readonly refused: ReadonlyArray<string>
  /** Stops refreshing. Safe to call more than once. */
  readonly stop: () => void
}

export const defaultApiUrl = "https://app.smartplane.dev"
const minRefreshMs = 1_000

const processEnv = (): Record<string, string | undefined> | undefined => (typeof process === "undefined" ? undefined : process.env)

/** Writes values into process.env, remembering which names it owns so a refresh can update or remove only those. */
const envWriter = (target: "process.env" | "none", override: boolean) => {
  const owned = new Set<string>()
  return (values: Readonly<Record<string, string>>) => {
    const env = target === "process.env" ? processEnv() : undefined
    if (env === undefined) return
    for (const name of owned) {
      if (!(name in values)) {
        delete env[name]
        owned.delete(name)
      }
    }
    for (const [name, value] of Object.entries(values)) {
      if (owned.has(name) || override || env[name] === undefined) {
        env[name] = value
        owned.add(name)
      }
    }
  }
}

const valuesOf = (delivery: Delivery) => Object.fromEntries(delivery.env.map((item) => [item.name, item.value]))

/** Skipped, not fatal: one bad name must not stop a service from booting with the rest. */
const warnRefused = (delivery: Delivery) => {
  if (delivery.refused.length === 0) return
  console.warn(`@smartplane/secrets: skipped unsafe env names (they change how programs load code): ${delivery.refused.join(", ")}`)
}

/** Loads values with `purpose: "boot"`; values live in memory (and process.env) only, never on disk. */
export const loadSecrets = async (options: LoadSecretsOptions = {}): Promise<LoadedSecrets> => {
  const token = options.token ?? processEnv()?.SMARTPLANE_TOKEN ?? ""
  if (token === "") throw new UnauthorizedError("No Smartplane token: set SMARTPLANE_TOKEN or pass `token`.")
  const apiUrl = (options.apiUrl ?? processEnv()?.SMARTPLANE_API_URL ?? defaultApiUrl).replace(/\/+$/, "")
  const call = {
    apiUrl,
    token,
    ...(options.names ? { names: options.names } : {}),
    ...(options.projectId ? { projectId: options.projectId } : {}),
    fetch: options.fetch ?? globalThis.fetch,
    ...(options.signal ? { signal: options.signal } : {})
  }
  const write = envWriter(options.target ?? "process.env", options.override ?? false)
  const first = await requestDelivery({ ...call, retries: options.retries ?? 3 })
  warnRefused(first)
  const env: Record<string, string> = valuesOf(first)
  write(env)

  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const stop = () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    options.signal?.removeEventListener("abort", stop)
  }
  options.signal?.addEventListener("abort", stop, { once: true })

  const refresh = async () => {
    try {
      const delivery = await requestDelivery({ ...call, retries: 1 })
      warnRefused(delivery)
      const next = valuesOf(delivery)
      if (stopped) return
      const changed = Object.keys(next).filter((name) => env[name] !== next[name])
      const removed = Object.keys(env).filter((name) => !(name in next))
      for (const name of removed) delete env[name]
      Object.assign(env, next)
      write(env)
      options.onRefresh?.({ env, changed, removed })
    } catch (error) {
      if (stopped) return
      if (error instanceof SmartplaneError) options.onError?.(error)
      if (error instanceof UnauthorizedError) return stop()
    }
    schedule()
  }
  const schedule = () => {
    if (stopped || options.refreshEvery === undefined) return
    const every = Math.max(options.refreshEvery, minRefreshMs)
    timer = setTimeout(() => void refresh(), every * (0.9 + Math.random() * 0.2))
    // A refresh loop alone must not keep the process alive.
    if (typeof timer === "object" && timer !== null && "unref" in timer) timer.unref()
  }
  schedule()

  return { env, denied: first.denied, expiresAt: first.expiresAt, refused: first.refused, stop }
}
