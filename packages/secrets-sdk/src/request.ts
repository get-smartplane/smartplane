import {
  ForbiddenError,
  InvalidResponseError,
  NetworkError,
  RateLimitedError,
  redact,
  type SmartplaneError,
  UnauthorizedError
} from "./errors.js"
import { type Delivery, parseDelivery } from "./response.js"

/** Only what the SDK calls, so a Worker's, a test's or any runtime's fetch fits. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface DeliveryCall {
  readonly apiUrl: string
  readonly token: string
  readonly names?: ReadonlyArray<string>
  readonly projectId?: string
  readonly retries: number
  readonly fetch: FetchLike
  readonly signal?: AbortSignal
}

const requestTimeoutMs = 10_000
const maxRetryAfterMs = 30_000
const userAgent = "smartplane-secrets-js/0.1.0"

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })

/** Exponential backoff with full jitter: 250ms, 500ms, 1s ... capped at 5s. */
const backoff = (attempt: number) => Math.random() * Math.min(5_000, 250 * 2 ** attempt)

export const retryAfterMs = (header: string | null): number => {
  if (header === null) return 1_000
  const seconds = /^\d+$/.test(header.trim()) ? Number(header.trim()) : (Date.parse(header) - Date.now()) / 1000
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds * 1000, 0), maxRetryAfterMs) : 1_000
}

/** A timeout per attempt, plus the caller's signal (AbortSignal.any is too new for Node 18). */
const attemptSignal = (outer?: AbortSignal) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("timed out")), requestTimeoutMs)
  const onAbort = () => controller.abort(outer?.reason)
  outer?.addEventListener("abort", onAbort, { once: true })
  return { signal: controller.signal, done: () => (clearTimeout(timer), outer?.removeEventListener("abort", onAbort)) }
}

const serverMessage = async (response: Response, token: string) => {
  const body: unknown = await response.json().catch(() => null)
  const message = typeof body === "object" && body !== null && "message" in body && typeof body.message === "string" ? body.message : ""
  return message === "" ? "" : `: ${redact(message, token)}`
}

type Attempt = { readonly ok: Delivery } | { readonly retry: SmartplaneError; readonly waitMs?: number } | { readonly fail: SmartplaneError }

const attempt = async (call: DeliveryCall): Promise<Attempt> => {
  const body = JSON.stringify({ purpose: "boot", ...(call.names ? { names: call.names } : {}), ...(call.projectId ? { projectId: call.projectId } : {}) })
  const { signal, done } = attemptSignal(call.signal)
  let response: Response
  try {
    response = await call.fetch(`${call.apiUrl}/api/secrets/deliver`, {
      method: "POST",
      headers: { authorization: `Bearer ${call.token}`, "content-type": "application/json", "user-agent": userAgent },
      body,
      signal
    })
  } catch (cause) {
    done()
    if (call.signal?.aborted) throw call.signal.reason
    return { retry: new NetworkError(`Could not reach ${call.apiUrl}.`, undefined, { cause }) }
  }
  done()
  const status = response.status
  if (status === 200) {
    const json: unknown = await response.json().catch(() => undefined)
    return { ok: parseDelivery(json) }
  }
  if (status === 401) return { fail: new UnauthorizedError(`The token was not accepted${await serverMessage(response, call.token)}.`, 401) }
  if (status === 403) return { fail: new ForbiddenError(`The token may not receive these values${await serverMessage(response, call.token)}.`, 403) }
  if (status === 429) {
    const waitMs = retryAfterMs(response.headers.get("retry-after"))
    return { retry: new RateLimitedError("Rate limited by Smartplane.", waitMs), waitMs }
  }
  if (status >= 500) return { retry: new NetworkError(`Smartplane answered HTTP ${status}.`, status) }
  return { fail: new InvalidResponseError(`Smartplane refused the request (HTTP ${status})${await serverMessage(response, call.token)}.`, status) }
}

/** One delivery, retried on network errors, 5xx and 429 (honouring Retry-After) up to `retries` times. */
export const requestDelivery = async (call: DeliveryCall): Promise<Delivery> => {
  for (let tries = 0;; tries++) {
    const result = await attempt(call)
    if ("ok" in result) return result.ok
    if ("fail" in result || tries >= call.retries) throw "fail" in result ? result.fail : result.retry
    await sleep(result.waitMs ?? backoff(tries), call.signal)
  }
}
