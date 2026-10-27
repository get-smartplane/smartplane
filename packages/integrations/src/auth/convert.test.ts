import { describe, expect, it } from "@effect/vitest"
import { convertAuth } from "./convert"

describe("piece auth", () => {
  it("describes each supported connection method without secrets, in the piece's order", () => {
    const converted = convertAuth([
      {
        type: "OAUTH2",
        displayName: "Zendesk",
        authUrl: "https://{subdomain}.zendesk.com/oauth/authorizations/new",
        tokenUrl: "https://{subdomain}.zendesk.com/oauth/tokens",
        scope: ["read"],
        pkce: true,
        pkceMethod: "S256",
        props: {
          subdomain: { type: "SHORT_TEXT", displayName: "Subdomain", required: true },
          tenant: { type: "SHORT_TEXT", displayName: "Tenant", required: true, defaultValue: "common" },
          blank: { type: "SHORT_TEXT", displayName: "Blank", defaultValue: "" }
        }
      },
      { type: "CUSTOM_AUTH", displayName: "API token", props: { email: { type: "SHORT_TEXT", displayName: "Email", required: true }, token: { type: "SECRET_TEXT", displayName: "Token", required: true } } },
      { type: "BASIC_AUTH", displayName: "Key", username: { displayName: "API key" }, password: { displayName: "Token" } },
      { type: "SECRET_TEXT", displayName: "Personal token", description: "From settings" },
      { type: "OAUTH2", displayName: "Machine", authUrl: "x", tokenUrl: "y", scope: [], grantType: "client_credentials" },
      { type: "OIDC", displayName: "Enterprise" }
    ])
    expect(converted.authTypes).toEqual(["oauth2", "custom", "basic", "secret_text"])
    expect(converted.skipped).toEqual(["OAUTH2", "OIDC"])
    expect(converted.auth[0]).toMatchObject({ pkce: "S256", clientAuthentication: "body", prompt: null, fields: [{ name: "subdomain", kind: "text", required: true }, { name: "tenant", defaultValue: "common" }, { name: "blank" }] })
    expect(converted.auth[0]?.type === "oauth2" ? converted.auth[0].fields.map((field) => "defaultValue" in field) : []).toEqual([false, true, false])
    expect(converted.auth[1]).toMatchObject({ fields: [{ name: "email", kind: "text" }, { name: "token", kind: "secret" }] })
    expect(converted.auth[3]).toEqual({ type: "secret_text", displayName: "Personal token", description: "From settings" })
  })

  it("treats a piece without auth as connecting with `none`", () => {
    expect(convertAuth(undefined)).toEqual({ auth: [], authTypes: ["none"], skipped: [] })
  })
})
