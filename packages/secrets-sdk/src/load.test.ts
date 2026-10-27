import { inspect } from "node:util"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ForbiddenError, InvalidResponseError, loadSecrets, NetworkError, RateLimitedError, UnauthorizedError } from "./index.js"
import { delivery, fakeServer } from "./testing/fake-server.js"

const token = "pcm_super_secret_token_value"
const names = ["SDK_API_KEY", "SDK_REGION", "SDK_OTHER"]
const servers: Array<{ close: () => Promise<void> }> = []
const serve = async (...args: Parameters<typeof fakeServer>) => {
  const server = await fakeServer(...args)
  servers.push(server)
  return server
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => names.forEach((name) => delete process.env[name]))
afterEach(async () => {
  names.forEach((name) => delete process.env[name])
  delete process.env["SMARTPLANE_TOKEN"]
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe("loadSecrets", () => {
  it("fills process.env with purpose boot and the bearer token", async () => {
    const server = await serve(() => delivery({ SDK_API_KEY: "sk_1", SDK_REGION: "eu" }, [{ name: "SDK_OTHER", reason: "no_grant" }]))
    const loaded = await loadSecrets({ token, apiUrl: server.url, names: ["SDK_API_KEY", "SDK_OTHER"], projectId: "prj_abcdefgh" })
    expect(process.env["SDK_API_KEY"]).toBe("sk_1")
    expect(loaded.env).toEqual({ SDK_API_KEY: "sk_1", SDK_REGION: "eu" })
    expect(loaded.denied).toEqual([{ name: "SDK_OTHER", reason: "no_grant" }])
    expect(server.requests[0]).toMatchObject({ method: "POST", path: "/api/secrets/deliver", headers: { authorization: `Bearer ${token}` } })
    expect(server.requests[0]?.body).toEqual({ purpose: "boot", names: ["SDK_API_KEY", "SDK_OTHER"], projectId: "prj_abcdefgh" })
  })

  it("skips loader variables a compromised server sends, with a warning, and loads the rest", async () => {
    const before = { NODE_OPTIONS: process.env["NODE_OPTIONS"], LD_PRELOAD: process.env["LD_PRELOAD"], PATH: process.env["PATH"] }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const server = await serve(() => delivery({ SDK_API_KEY: "sk_1", NODE_OPTIONS: "--require /tmp/x.js", LD_PRELOAD: "/tmp/x.so", PATH: "/tmp", npm_config_script_shell: "/tmp/sh" }))
      const loaded = await loadSecrets({ token, apiUrl: server.url, override: true })
      expect(loaded.env).toEqual({ SDK_API_KEY: "sk_1" })
      expect(loaded.refused).toEqual(["NODE_OPTIONS", "LD_PRELOAD", "PATH", "npm_config_script_shell"])
      expect({ NODE_OPTIONS: process.env["NODE_OPTIONS"], LD_PRELOAD: process.env["LD_PRELOAD"], PATH: process.env["PATH"] }).toEqual(before)
      expect(process.env["SDK_API_KEY"]).toBe("sk_1")
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("NODE_OPTIONS, LD_PRELOAD, PATH, npm_config_script_shell"))
    } finally {
      warn.mockRestore()
    }
  })

  it("reads the token from SMARTPLANE_TOKEN by default", async () => {
    process.env["SMARTPLANE_TOKEN"] = token
    const server = await serve(() => delivery({ SDK_API_KEY: "sk_1" }))
    await loadSecrets({ apiUrl: server.url })
    expect(server.requests[0]?.headers.authorization).toBe(`Bearer ${token}`)
  })

  it("keeps variables already set unless override is true", async () => {
    const server = await serve(() => delivery({ SDK_API_KEY: "from-smartplane" }))
    process.env["SDK_API_KEY"] = "from-platform"
    const kept = await loadSecrets({ token, apiUrl: server.url })
    expect(process.env["SDK_API_KEY"]).toBe("from-platform")
    expect(kept.env["SDK_API_KEY"]).toBe("from-smartplane")
    await loadSecrets({ token, apiUrl: server.url, override: true })
    expect(process.env["SDK_API_KEY"]).toBe("from-smartplane")
  })

  it("leaves process.env alone with target none", async () => {
    const server = await serve(() => delivery({ SDK_API_KEY: "sk_1" }))
    const loaded = await loadSecrets({ token, apiUrl: server.url, target: "none" })
    expect(loaded.env["SDK_API_KEY"]).toBe("sk_1")
    expect(process.env["SDK_API_KEY"]).toBeUndefined()
  })

  it("refreshes in place, removes revoked names, and stops", async () => {
    const server = await serve((_, count) => (count === 1 ? delivery({ SDK_API_KEY: "v1", SDK_REGION: "eu" }) : delivery({ SDK_API_KEY: "v2" })))
    const events: Array<unknown> = []
    const loaded = await loadSecrets({ token, apiUrl: server.url, refreshEvery: 1000, onRefresh: ({ changed, removed }) => events.push({ changed, removed }) })
    await wait(1250)
    expect(process.env["SDK_API_KEY"]).toBe("v2")
    expect(process.env["SDK_REGION"]).toBeUndefined()
    expect(loaded.env).toEqual({ SDK_API_KEY: "v2" })
    expect(events[0]).toEqual({ changed: ["SDK_API_KEY"], removed: ["SDK_REGION"] })
    loaded.stop()
    const count = server.requests.length
    await wait(1250)
    expect(server.requests.length).toBe(count)
  })

  it("stops refreshing when the signal aborts", async () => {
    const server = await serve(() => delivery({ SDK_API_KEY: "v1" }))
    const controller = new AbortController()
    await loadSecrets({ token, apiUrl: server.url, refreshEvery: 1000, signal: controller.signal })
    controller.abort()
    await wait(1250)
    expect(server.requests.length).toBe(1)
  })
})

describe("errors", () => {
  it("throws UnauthorizedError on 401 without retrying, and without a token", async () => {
    const server = await serve(() => ({ status: 401, body: { _tag: "Unauthorized", reason: "expired" } }))
    await expect(loadSecrets({ token, apiUrl: server.url })).rejects.toBeInstanceOf(UnauthorizedError)
    expect(server.requests.length).toBe(1)
    await expect(loadSecrets({ apiUrl: server.url })).rejects.toBeInstanceOf(UnauthorizedError)
    expect(server.requests.length).toBe(1)
  })

  it("throws ForbiddenError on 403", async () => {
    const server = await serve(() => ({ status: 403, body: { _tag: "Forbidden", message: "nope" } }))
    await expect(loadSecrets({ token, apiUrl: server.url })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("retries 429 after Retry-After, then throws RateLimitedError", async () => {
    const server = await serve(() => ({ status: 429, headers: { "retry-after": "0" } }))
    await expect(loadSecrets({ token, apiUrl: server.url, retries: 2 })).rejects.toBeInstanceOf(RateLimitedError)
    expect(server.requests.length).toBe(3)
  })

  it("retries a 5xx and succeeds", async () => {
    const server = await serve((_, count) => (count === 1 ? { status: 503 } : delivery({ SDK_API_KEY: "ok" })))
    expect((await loadSecrets({ token, apiUrl: server.url, target: "none" })).env).toEqual({ SDK_API_KEY: "ok" })
  })

  it("throws NetworkError when the API cannot be reached", async () => {
    const server = await serve(() => ({}))
    await server.close()
    await expect(loadSecrets({ token, apiUrl: server.url, retries: 1 })).rejects.toBeInstanceOf(NetworkError)
  })

  it("throws InvalidResponseError on a body it does not understand", async () => {
    const server = await serve(() => ({ body: { env: [{ name: "X", value: 1 }], denied: [] } }))
    await expect(loadSecrets({ token, apiUrl: server.url })).rejects.toBeInstanceOf(InvalidResponseError)
  })

  it("never puts the token in an error, even when the server echoes it", async () => {
    const replies = [
      { status: 401, body: { message: `bad token ${token}` } },
      { status: 403, body: { message: `token ${token} may not` } },
      { status: 400, body: { message: `invalid ${token}` } },
      { status: 429 }
    ]
    for (const reply of replies) {
      const server = await serve(() => reply)
      const error = await loadSecrets({ token, apiUrl: server.url, retries: 0 }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(Error)
      const rendered = [String(error), (error as Error).stack, inspect(error, { depth: 10 }), JSON.stringify(error)].join("\n")
      expect(rendered).not.toContain(token)
    }
    const closed = await serve(() => ({}))
    await closed.close()
    const network = await loadSecrets({ token, apiUrl: closed.url, retries: 0 }).catch((e: unknown) => e)
    expect(inspect(network, { depth: 10 })).not.toContain(token)
  })
})
