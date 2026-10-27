import { readdirSync, readFileSync } from "node:fs"
import { afterEach, describe, expect, it } from "vitest"
import { createSecretsCache, type FetchLike, loadSecrets, NetworkError, UnauthorizedError } from "./index.js"

const token = "pcm_worker_token_value"
const apiUrl = "https://smartplane.test"

/** A fetch like a Worker's: no server, no Node APIs; records each call and answers from `reply`. */
const workerFetch = (reply: (count: number) => Response) => {
  const calls: Array<{ readonly url: string; readonly auth: string | null; readonly body: unknown }> = []
  const fetch: FetchLike = async (url, init) => {
    const headers = new Headers(init.headers)
    calls.push({ url, auth: headers.get("authorization"), body: JSON.parse(String(init.body)) })
    return reply(calls.length)
  }
  return { fetch, calls }
}

const delivered = (values: Record<string, string>) =>
  Response.json({
    env: Object.entries(values).map(([name, value]) => ({ name, value, kind: "secret", version: "1", resourceId: `res_${name.toLowerCase()}` })),
    denied: [],
    expiresAt: "2027-01-01T00:00:00.000Z"
  })

/**
 * Runs `body` with `process` gone, as in a Worker without `nodejs_compat`. Any read of the global, even
 * `typeof process`, goes through the getter, so `reads` counts every place the SDK reached for it.
 */
const withoutProcess = async <A>(body: () => Promise<A>): Promise<{ readonly result: A; readonly reads: number }> => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "process")
  let reads = 0
  Object.defineProperty(globalThis, "process", { configurable: true, get: () => (reads++, undefined) })
  try {
    return { result: await body(), reads }
  } finally {
    if (original) Object.defineProperty(globalThis, "process", original)
  }
}

afterEach(() => expect(typeof process.env).toBe("object"))

describe("in a Workers-like runtime (no process)", () => {
  it("loads with target none and an explicit token without ever reading process", async () => {
    const { fetch, calls } = workerFetch(() => delivered({ STRIPE_KEY: "sk_1" }))
    const { result, reads } = await withoutProcess(() => loadSecrets({ token, apiUrl, target: "none", fetch }))
    expect(result.env).toEqual({ STRIPE_KEY: "sk_1" })
    expect(reads).toBe(0)
    expect(calls[0]).toEqual({ url: `${apiUrl}/api/secrets/deliver`, auth: `Bearer ${token}`, body: { purpose: "boot" } })
  })

  it("falls back to the default API URL and still works when process is absent", async () => {
    const { fetch, calls } = workerFetch(() => delivered({ A: "1" }))
    const { result } = await withoutProcess(() => loadSecrets({ token, target: "none", fetch }))
    expect(result.env).toEqual({ A: "1" })
    expect(calls[0]?.url).toBe("https://app.smartplane.dev/api/secrets/deliver")
  })

  it("does not crash writing to process.env when there is none", async () => {
    const { fetch } = workerFetch(() => delivered({ A: "1" }))
    const { result } = await withoutProcess(() => loadSecrets({ token, apiUrl, fetch }))
    expect(result.env).toEqual({ A: "1" })
  })

  it("reports a missing token as UnauthorizedError, not a ReferenceError", async () => {
    const { fetch } = workerFetch(() => delivered({}))
    const { result } = await withoutProcess(() => loadSecrets({ apiUrl, target: "none", fetch }).catch((error: unknown) => error))
    expect(result).toBeInstanceOf(UnauthorizedError)
  })
})

describe("createSecretsCache", () => {
  it("fetches once per isolate and reuses the values until maxAge, without touching process", async () => {
    const { fetch, calls } = workerFetch((count) => delivered({ KEY: `v${count}` }))
    const cache = createSecretsCache({ apiUrl, fetch, maxAgeMs: 60_000 })
    const { result, reads } = await withoutProcess(async () => [await cache.get({ token }), await cache.get({ token })])
    expect(result).toEqual([{ KEY: "v1" }, { KEY: "v1" }])
    expect(calls.length).toBe(1)
    expect(reads).toBe(0)
    expect(Object.isFrozen(result[0])).toBe(true)
  })

  it("fetches again after maxAge, and for a different token", async () => {
    const { fetch, calls } = workerFetch((count) => delivered({ KEY: `v${count}` }))
    const cache = createSecretsCache({ apiUrl, fetch, maxAgeMs: 1_000 })
    expect(await cache.get({ token })).toEqual({ KEY: "v1" })
    expect(await cache.get({ token: "pcm_other_token" })).toEqual({ KEY: "v2" })
    cache.clear()
    expect(await cache.get({ token })).toEqual({ KEY: "v3" })
    expect(calls.map((call) => call.auth)).toEqual([`Bearer ${token}`, "Bearer pcm_other_token", `Bearer ${token}`])
  })

  it("serves the previous values when a refetch fails, but never after a 401", async () => {
    let answer = (_count: number) => delivered({ KEY: "v1" })
    const { fetch } = workerFetch((count) => answer(count))
    const errors: Array<string> = []
    const cache = createSecretsCache({ token, apiUrl, fetch, maxAgeMs: 1_000, retries: 0, onError: (error) => errors.push(error.name) })
    await cache.get()
    const realNow = Date.now
    Date.now = () => realNow() + 5_000
    try {
      answer = () => new Response(null, { status: 503 })
      expect(await cache.get()).toEqual({ KEY: "v1" })
      expect(errors).toEqual([NetworkError.name])
      answer = () => Response.json({ _tag: "Unauthorized" }, { status: 401 })
      await expect(cache.get()).rejects.toBeInstanceOf(UnauthorizedError)
      answer = () => new Response(null, { status: 503 })
      await expect(cache.get()).rejects.toBeInstanceOf(NetworkError)
    } finally {
      Date.now = realNow
    }
  })
})

describe("the package source", () => {
  it("imports no Node built-ins, so bundlers for Workers and browsers take it as is", () => {
    const dir = new URL(".", import.meta.url)
    const sources = readdirSync(dir).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    expect(sources.length).toBeGreaterThan(3)
    for (const file of sources) expect(readFileSync(new URL(file, dir), "utf8")).not.toMatch(/from "node:|require\(/)
  })
})
