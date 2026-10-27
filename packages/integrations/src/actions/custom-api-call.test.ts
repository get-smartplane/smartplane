import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import generated from "../generated/catalog.json"
import { makeInputValidator } from "../validation"
import { customApiCallInputError, customApiCallUrlSchema } from "./custom-api-call"

const Catalog = Schema.Struct({
  pieces: Schema.Array(Schema.Struct({ id: Schema.String, actions: Schema.Array(Schema.Struct({ name: Schema.String, inputSchema: Schema.JsonObject })) }))
})
const githubCustomApiCall = Schema.decodeUnknownSync(Catalog)(generated).pieces.find((piece) => piece.id === "github")?.actions.find((action) => action.name === "custom_api_call")

describe("custom_api_call", () => {
  it("accepts only paths relative to the provider's API", () => {
    const refused = (url: Schema.Json) => customApiCallInputError("custom_api_call", { url: { url }, method: "GET" })?.field
    expect(refused("/repos/acme/widgets/issues")).toBeUndefined()
    expect(refused("repos/acme/widgets")).toBeUndefined()
    expect(refused("/v1/files:copy")).toBeUndefined()
    expect(refused("https://attacker.example/collect")).toBe("url.url")
    expect(refused("  HTTPS://attacker.example")).toBe("url.url")
    expect(refused("//attacker.example/collect")).toBe("url.url")
    expect(refused("\\\\attacker.example")).toBe("url.url")
    expect(refused("javascript:alert(1)")).toBe("url.url")
    expect(refused("")).toBe("url.url")
    expect(refused(["https://attacker.example"])).toBe("url.url")
    expect(customApiCallInputError("custom_api_call", { url: "https://attacker.example", method: "GET" })?.field).toBe("url.url")
    expect(customApiCallInputError("get_issue_ai", { url: "https://github.com" })).toBeNull()
  })

  it("is typed in the catalog and enforced by the compiled validator", () => {
    expect(githubCustomApiCall?.inputSchema).toMatchObject({ properties: { url: customApiCallUrlSchema }, required: ["url", "method"] })
    const validate = makeInputValidator("custom_api_call", githubCustomApiCall?.inputSchema ?? {})
    expect(Effect.runSync(validate({ url: { url: "/user" }, method: "GET" }))).toEqual({ url: { url: "/user" }, method: "GET" })
    const absolute = Effect.runSync(Effect.flip(validate({ url: { url: "https://attacker.example" }, method: "GET" })))
    expect(absolute._tag).toBe("InvalidInput")
    expect(Effect.runSync(Effect.flip(validate({ url: "/user", method: "GET" })))._tag).toBe("InvalidInput")
  })
})
