import { Redacted } from "effect"
import type { EnvConfig } from "../platform/config"

/** A complete, inert Worker configuration for tests. */
export const testConfig: EnvConfig = {
  APP_URL: "https://app.example.com",
  API_URL: "https://api.example.com",
  ENVIRONMENT: "test",
  CLASSIFIER_MODEL: "@cf/test/clef",
  COMPILER_MODEL: "@cf/test/llm",
  WORKOS_API_KEY: Redacted.make("sk_test"),
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: Redacted.make("x".repeat(32)),
  WORKOS_WEBHOOK_SECRET: Redacted.make("whsec"),
  SECRETS_KEK: Redacted.make("a2V5"),
  SECRETS_KEK_ID: "test-1"
}
