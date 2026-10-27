import { describe, expect, it } from "@effect/vitest"
import { Redacted } from "effect"
import { pick, request } from "../testing/harness"
import { connectionValue, scrubber, secretsOf } from "./auth-value"
import { actionContext } from "./context"
import { toOutput } from "./output"

const oauth2 = {
  type: "oauth2" as const,
  accessToken: Redacted.make("xoxb-access-123"),
  tokenType: "bearer",
  scope: "chat:write",
  data: Redacted.make({ authed_user: { access_token: "xoxp-user-456", id: "U1" }, team: { name: "Acme" } }),
  props: { subdomain: "acme" }
}

describe("connection values", () => {
  it("shapes each connection type the way pieces read context.auth", () => {
    expect(connectionValue({ type: "none" })).toBeUndefined()
    expect(connectionValue({ type: "basic", username: "key", password: Redacted.make("tok") })).toEqual({ type: "BASIC_AUTH", username: "key", password: "tok" })
    expect(connectionValue({ type: "custom", props: Redacted.make({ instanceUrl: "https://acme.atlassian.net", apiToken: "t" }) })).toEqual({
      type: "CUSTOM_AUTH",
      props: { instanceUrl: "https://acme.atlassian.net", apiToken: "t" }
    })
    expect(connectionValue(oauth2)).toEqual({
      type: "OAUTH2",
      access_token: "xoxb-access-123",
      token_type: "bearer",
      scope: "chat:write",
      data: { authed_user: { access_token: "xoxp-user-456", id: "U1" }, team: { name: "Acme" } },
      props: { subdomain: "acme" }
    })
  })

  it("collects token-like strings for scrubbing, nested ones included", () => {
    expect(secretsOf(oauth2)).toEqual(["xoxb-access-123", "xoxp-user-456"])
    expect(scrubber(secretsOf(oauth2))("bad token xoxp-user-456 / \"xoxb-access-123\"")).toBe("bad token [redacted] / \"[redacted]\"")
  })

  it("scrubs credentials however a request or response spells them", () => {
    const basic = { type: "basic" as const, username: "svc", password: Redacted.make("p@ss word/1") }
    const scrub = scrubber(secretsOf(basic))
    expect(scrub(`Authorization: Basic ${btoa("svc:p@ss word/1")}`)).toBe("Authorization: Basic [redacted]")
    expect(scrub(`?key=${encodeURIComponent("p@ss word/1")}`)).toBe("?key=[redacted]")
    expect(scrub(`raw p@ss word/1 and b64 ${btoa("p@ss word/1")}`)).toBe("raw [redacted] and b64 [redacted]")
    expect(scrubber(["tok\"en/1"])(JSON.stringify({ body: "tok\"en/1" }))).toBe("{\"body\":\"[redacted]\"}")
  })
})

describe("action context", () => {
  const context = actionContext({ request: request("fake", "x", {}), propsValue: { a: 1 }, store: { put: async () => null, get: async () => null, delete: async () => undefined }, runId: "run-1" })

  it("answers file writes with a note instead of storing the file", async () => {
    const write = pick(context, "files", "write")
    expect(typeof write).toBe("function")
    if (typeof write === "function") expect(await write({ fileName: "a.pdf", data: new Uint8Array(3) })).toContain("a.pdf (3 bytes")
  })

  it("fails with UnsupportedAction on Activepieces-only members", () => {
    expect(() => pick(context, "server", "token")).toThrow(/context.server/)
    const waitpoint = pick(context, "run", "createWaitpoint")
    expect(() => (typeof waitpoint === "function" ? waitpoint() : undefined)).toThrow(/run.createWaitpoint/)
  })
})

describe("output", () => {
  it("serialises bigints, binary data and cycles, and scrubs credentials", () => {
    const cyclic: Record<string, unknown> = { id: 1n, bytes: new Uint8Array(2), note: "token abc123secret" }
    cyclic.self = cyclic
    expect(toOutput(cyclic, scrubber(["abc123secret"]))).toEqual({
      output: { id: "1", bytes: "[2 bytes of binary data omitted]", note: "token [redacted]", self: "[circular]" },
      truncated: false
    })
    expect(toOutput(undefined, (text) => text)).toEqual({ output: null, truncated: false })
  })
})
