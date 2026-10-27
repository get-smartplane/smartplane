import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { AppConfig } from "./config"

const valid = {
  APP_URL: "https://app.example.com",
  API_URL: "https://app.example.com",
  ENVIRONMENT: "production",
  CLASSIFIER_MODEL: "m",
  COMPILER_MODEL: "m",
  WORKOS_API_KEY: "sk_live",
  WORKOS_CLIENT_ID: "client_1",
  WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  WORKOS_WEBHOOK_SECRET: "whsec",
  SECRETS_KEK: "kek",
  SECRETS_KEK_ID: "kek-1"
}

const failure = (env: Record<string, unknown>) =>
  Effect.runSyncExit(Effect.provide(Effect.gen(function*() { return yield* AppConfig }), AppConfig.fromEnv(env)))

describe("AppConfig.fromEnv", () => {
  it("names the invalid settings without their values", () => {
    const exit = failure({ ...valid, WORKOS_COOKIE_PASSWORD: "short-secret-value", WORKOS_WEBHOOK_SECRET: "" })
    assert.isTrue(Exit.isFailure(exit))
    const text = String(Exit.isFailure(exit) ? exit.cause : "")
    assert.include(text, "WORKOS_COOKIE_PASSWORD")
    assert.include(text, "WORKOS_WEBHOOK_SECRET")
    assert.notInclude(text, "short-secret-value")
  })

  it("decodes a complete configuration", () => {
    assert.isTrue(Exit.isSuccess(failure(valid)))
  })
})
