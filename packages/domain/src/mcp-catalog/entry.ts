import { Schema } from "effect"
import { PieceId } from "../integrations/names"
import { Name, Slug } from "../primitives"
import { McpTransport } from "../resources/config"

/** An `https://` URL; catalog servers are reached only over TLS. */
const HttpsUrl = Schema.String.check(Schema.isPattern(/^https:\/\/[^\s/]+\S*$/), Schema.isMaxLength(2048))

/**
 * How a catalog server signs in:
 * - `oauth-dcr`: MCP OAuth with dynamic client registration and PKCE S256, so Connect needs nothing typed.
 * - `oauth-client`: MCP OAuth, but the provider wants a pre-registered client (an admin enters its id).
 * - `token`: a personal access token or API key.
 */
export const McpCatalogAuth = Schema.Literals(["oauth-dcr", "oauth-client", "token"]).annotate({ identifier: "McpCatalogAuth" })
export type McpCatalogAuth = typeof McpCatalogAuth.Type

export const McpCatalogCategory = Schema.Literals([
  "developer",
  "project_management",
  "productivity",
  "design",
  "payments",
  "crm",
  "support",
  "data",
  "hosting"
]).annotate({ identifier: "McpCatalogCategory" })
export type McpCatalogCategory = typeof McpCatalogCategory.Type

/** A calendar date, `YYYY-MM-DD`. */
export const CalendarDate = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)).annotate({ identifier: "CalendarDate" })

/** What live discovery found the last time the entry was verified (`apps/api/scripts/verify-mcp-catalog.ts`). */
export const McpCatalogVerification = Schema.Struct({
  verifiedAt: CalendarDate,
  /** The authorization server's RFC 8414 `issuer`; null when discovery found none (a `token` server). */
  issuer: Schema.NullOr(HttpsUrl),
  /** A `registration_endpoint` (RFC 7591) was advertised. */
  dynamicRegistration: Schema.Boolean,
  /** `code_challenge_methods_supported` listed `S256`. */
  pkceS256: Schema.Boolean
}).annotate({ identifier: "McpCatalogVerification" })
export type McpCatalogVerification = typeof McpCatalogVerification.Type

/** One official remote MCP server, as its vendor documents it. */
export const McpCatalogEntry = Schema.Struct({
  slug: Slug,
  name: Name,
  vendor: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
  /** One sentence. */
  description: Schema.NonEmptyString.check(Schema.isMaxLength(200)),
  /** "What it can do": a few short phrases, curated; live tools need a sign-in first. */
  capabilities: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(60))).check(Schema.isMaxLength(5)),
  category: McpCatalogCategory,
  /** Rank in "Popular": 1 is shown first. */
  popularity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  logoUrl: HttpsUrl,
  url: HttpsUrl,
  transport: McpTransport,
  auth: McpCatalogAuth,
  docsUrl: HttpsUrl,
  /** Where the URL was taken from: the vendor's own documentation. */
  sourceUrl: HttpsUrl,
  /** What an admin must know before connecting (e.g. a workspace setting to turn on). */
  notes: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(240))),
  /** The bundled integration for the same product, offered under "Other ways to connect". */
  pieceId: Schema.optionalKey(PieceId),
  verification: McpCatalogVerification
}).annotate({ identifier: "McpCatalogEntry" })
export type McpCatalogEntry = typeof McpCatalogEntry.Type
