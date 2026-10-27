import { afterAll, describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Redacted } from "effect"
import { HttpRouter, HttpServer } from "effect/http"
import { AppConfig } from "../platform/config"
import { testConfig } from "../testing/config"
import { orgId } from "../testing/fixtures"
import { LoginStateCookie, sameLoginState } from "./login-state"
import { AuthRoutes } from "./routes"
import { SignIn } from "./sign-in"
import { WorkOS } from "./workos"

const exchanged: Array<string> = []
const unused = () => Effect.die("not used")
const workos = Layer.succeed(WorkOS, WorkOS.of({
  authorizationUrl: ({ state }) => `https://auth.example.com/authorize?state=${state}`,
  exchangeCode: (code) =>
    Effect.sync(() => {
      exchanged.push(code)
      return { user: { id: "user_01", email: "ada@example.com" }, organizationId: undefined, sealedSession: Redacted.make("sealed"), authenticationMethod: undefined }
    }),
  authenticate: unused, switchOrganization: unused, logoutUrl: unused,
  createOrganization: unused, createMembership: unused, sendInvitation: unused, verifyWebhook: () => Effect.succeed(false)
}))
const signIn = Layer.succeed(SignIn, SignIn.of({ complete: () => Effect.succeed(Option.some(orgId)) }))

const { handler, dispose } = HttpRouter.toWebHandler(
  AuthRoutes.pipe(Layer.provide(HttpServer.layerServices), Layer.provideMerge(Layer.mergeAll(workos, signIn, Layer.succeed(AppConfig, testConfig))))
)
afterAll(dispose)

const get = (path: string, cookie?: string) =>
  handler(new Request(`https://api.example.com${path}`, cookie === undefined ? {} : { headers: { cookie } }))

const startLogin = async () => {
  const response = await get("/auth/login")
  const state = new URL(response.headers.get("location") ?? "").searchParams.get("state") ?? ""
  return { state, setCookie: response.headers.get("set-cookie") ?? "" }
}

describe("AuthKit sign-in state", () => {
  it("binds a random state to the browser in a short-lived httpOnly cookie", async () => {
    const first = await startLogin()
    const second = await startLogin()
    expect(first.state).toMatch(/^[0-9a-f]{64}$/)
    expect(first.state).not.toBe(second.state)
    expect(first.setCookie).toContain(`${LoginStateCookie}=${first.state}`)
    expect(first.setCookie).toMatch(/HttpOnly/i)
    expect(first.setCookie).toMatch(/Secure/i)
    expect(first.setCookie).toMatch(/SameSite=Lax/i)
    expect(first.setCookie).toMatch(/Max-Age=600/i)
  })

  it("refuses a callback whose state does not match the cookie, before exchanging the code", async () => {
    exchanged.length = 0
    const { state } = await startLogin()
    for (const [query, cookie] of [[`code=attacker&state=${state}`, undefined], ["code=attacker", `${LoginStateCookie}=${state}`], [`code=attacker&state=${"0".repeat(64)}`, `${LoginStateCookie}=${state}`]] as const) {
      const response = await get(`/auth/callback?${query}`, cookie)
      expect(response.headers.get("location")).toBe("https://app.example.com/login?error=sign_in_failed")
    }
    expect(exchanged).toEqual([])
  })

  it("signs in when the state matches, and clears the state cookie", async () => {
    exchanged.length = 0
    const { state } = await startLogin()
    const response = await get(`/auth/callback?code=good&state=${state}`, `${LoginStateCookie}=${state}`)
    expect(response.headers.get("location")).toBe("https://app.example.com")
    expect(exchanged).toEqual(["good"])
    const cookies = response.headers.getSetCookie()
    expect(cookies.some((cookie) => cookie.startsWith("pc_session=sealed"))).toBe(true)
    expect(cookies.some((cookie) => cookie.startsWith(`${LoginStateCookie}=;`) || /pc_login_state=[^;]*;.*Max-Age=0/i.test(cookie))).toBe(true)
  })

  it("compares states exactly", () => {
    expect(sameLoginState("abc", "abc")).toBe(true)
    expect(sameLoginState("abc", "abd")).toBe(false)
    expect(sameLoginState("abc", "abcd")).toBe(false)
    expect(sameLoginState("", "")).toBe(false)
    expect(sameLoginState(undefined, "abc")).toBe(false)
  })
})
