import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { McpCatalogItem } from "../api/mcp-catalog"
import { findCatalogEntry, mcpCatalog, mcpCatalogSource, sameServerUrl } from "./catalog"
import { McpCatalogEntry } from "./entry"

const decodeEntry = Schema.decodeUnknownSync(McpCatalogEntry)
const linear = mcpCatalogSource.find((entry) => entry.slug === "linear")

describe("MCP catalog", () => {
  it("decodes every entry, sorted by popularity, with unique slugs and URLs", () => {
    expect(mcpCatalog.length).toBe(mcpCatalogSource.length)
    expect(mcpCatalog.map((entry) => entry.popularity)).toEqual([...mcpCatalog.map((entry) => entry.popularity)].sort((a, b) => a - b))
    expect(new Set(mcpCatalog.map((entry) => entry.slug)).size).toBe(mcpCatalog.length)
    expect(mcpCatalog[0]?.slug).toBe("linear")
  })

  it("lists only HTTPS servers, each with its vendor source and a verification date", () => {
    for (const entry of mcpCatalog) {
      expect(entry.url.startsWith("https://"), entry.slug).toBe(true)
      expect(entry.sourceUrl.startsWith("https://"), entry.slug).toBe(true)
      expect(entry.verification.verifiedAt, entry.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      if (entry.auth === "oauth-dcr") expect(entry.verification, entry.slug).toMatchObject({ dynamicRegistration: true, pkceS256: true })
    }
  })

  it("refuses entries that would break one-click Connect or the page", () => {
    expect(linear).toBeDefined()
    if (linear === undefined) return
    expect(() => decodeEntry({ ...linear, url: "http://mcp.linear.app/mcp" })).toThrow()
    expect(() => decodeEntry({ ...linear, slug: "Linear App" })).toThrow()
    expect(() => decodeEntry({ ...linear, auth: "magic" })).toThrow()
    expect(() => decodeEntry({ ...linear, verification: { ...linear.verification, verifiedAt: "yesterday" } })).toThrow()
    expect(() => decodeEntry({ ...linear, capabilities: ["a", "b", "c", "d", "e", "f"] })).toThrow()
  })

  it("finds entries by slug and matches server URLs regardless of a trailing slash", () => {
    expect(findCatalogEntry("notion")?.url).toBe("https://mcp.notion.com/mcp")
    expect(findCatalogEntry("nope")).toBeUndefined()
    expect(sameServerUrl("https://mcp.stripe.com/", "https://mcp.stripe.com")).toBe(true)
    expect(sameServerUrl("https://mcp.stripe.com/a", "https://mcp.stripe.com")).toBe(false)
  })

  it("round-trips a catalog item through the API schema", () => {
    const item = { entry: mcpCatalog[0], added: [{ resourceId: "res_linear0001", name: "Linear", accountMode: "shared", status: "connected", connectedBy: "ada@acme.dev", connectedAt: "2026-10-19T09:00:00.000Z" }] }
    const json = Schema.toCodecJson(McpCatalogItem)
    const decoded = Schema.decodeUnknownSync(json)(Schema.encodeSync(json)(Schema.decodeUnknownSync(json)(item)))
    expect(decoded.added[0]?.status).toBe("connected")
  })
})
