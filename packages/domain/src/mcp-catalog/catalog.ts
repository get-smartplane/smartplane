import { Schema } from "effect"
import { engineeringEntries } from "./entries-engineering"
import { workEntries } from "./entries-work"
import { McpCatalogEntry } from "./entry"

const UniqueEntries = Schema.Array(McpCatalogEntry).check(
  Schema.makeFilter((entries: ReadonlyArray<McpCatalogEntry>) => {
    const slugs = new Set(entries.map((entry) => entry.slug))
    const urls = new Set(entries.map((entry) => entry.url))
    if (slugs.size !== entries.length) return "catalog slugs must be unique"
    if (urls.size !== entries.length) return "catalog URLs must be unique"
    // One-click Connect promises discovery found a registration endpoint and S256 PKCE.
    const unverified = entries.find(({ auth, verification }) => auth === "oauth-dcr" && !(verification.dynamicRegistration && verification.pkceS256 && verification.issuer !== null))
    if (unverified !== undefined) return `${unverified.slug} is oauth-dcr but its verification does not show registration and S256`
    return undefined
  })
)

/** The raw entries, encoded; `mcpCatalog` is these decoded. Exported for the decoding test. */
export const mcpCatalogSource = [...workEntries, ...engineeringEntries]

/**
 * Official remote MCP servers an admin can connect in one click, most popular first. Decoded at load:
 * a malformed entry fails the Worker's startup and the test suite, never a request.
 */
export const mcpCatalog: ReadonlyArray<McpCatalogEntry> = Schema.decodeUnknownSync(UniqueEntries)(mcpCatalogSource)
  .slice()
  .sort((a, b) => a.popularity - b.popularity)

export const findCatalogEntry = (slug: string): McpCatalogEntry | undefined => mcpCatalog.find((entry) => entry.slug === slug)

/** Catalog URLs compared without a trailing slash, so `https://mcp.stripe.com/` is Stripe's server too. */
export const sameServerUrl = (a: string, b: string): boolean => a.replace(/\/+$/, "") === b.replace(/\/+$/, "")
