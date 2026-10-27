import { assert, describe, it } from "@effect/vitest"
import type { IntegrationPiece } from "@pc/domain"
import { Effect } from "effect"
import { decodeCatalog } from "./catalog"
import { curatedPieces } from "./curation"
import { pieceLoaders as businessLoaders } from "./generated/pieces/business"
import { pieceLoaders as coreLoaders } from "./generated/pieces/core"
import { shards } from "./shards"
import { compileInputSchema } from "./validation"

describe("generated catalog", () => {
  it.effect("decodes, covers every curated piece, and every runnable action compiles", () =>
    Effect.gen(function*() {
      const catalog = yield* decodeCatalog
      assert.deepStrictEqual(catalog.pieces.map((piece) => piece.id), curatedPieces.map((piece) => piece.id))
      for (const piece of catalog.pieces) {
        const names = new Set(piece.actions.map((action) => action.name))
        assert.isAbove(piece.supportedActionCount, 0, piece.id)
        for (const action of piece.actions) {
          if (action.support.status === "supported") compileInputSchema(action.inputSchema)
          if (action.support.status === "superseded") assert.isTrue(names.has(action.support.by), `${piece.id}/${action.name}`)
          assert.strictEqual(action.requiredAction, action.classification === "read" || action.classification === "search" ? "use" : "write")
        }
      }
    }))

  it.effect("prefers the agent variant: GitHub's classic create issue is superseded", () =>
    Effect.gen(function*() {
      const github = (yield* decodeCatalog).pieces.find((piece) => piece.id === "github")
      const classic = github?.actions.find((action) => action.name === "github_create_issue")
      assert.deepStrictEqual(classic?.support, { status: "superseded", by: "create_issue_ai" })
    }))

  it.effect("bundles every piece in exactly the shard the catalog records", () =>
    Effect.gen(function*() {
      const registries = { core: coreLoaders, business: businessLoaders }
      const catalog = yield* decodeCatalog
      assert.deepStrictEqual(Object.keys(registries), [...shards])
      for (const shard of shards) {
        const expected = catalog.pieces.filter((piece) => piece.shard === shard).map((piece) => piece.id)
        assert.deepStrictEqual(Object.keys(registries[shard]), expected, shard)
      }
    }))

  it.effect("Microsoft 365, ERP and CRM pieces connect as their providers require", () =>
    Effect.gen(function*() {
      const pieces = new Map<string, IntegrationPiece>((yield* decodeCatalog).pieces.map((piece) => [piece.id, piece]))
      const oauth = (id: string) => pieces.get(id)?.auth.find((auth) => auth.type === "oauth2")
      assert.include(oauth("microsoft-outlook")?.authUrl, "{cloud}/{tenant}/oauth2/v2.0/authorize")
      assert.deepStrictEqual(oauth("microsoft-outlook")?.scopes, ["{accessMode}"])
      const tenant = oauth("microsoft-teams")?.fields.find((field) => field.name === "tenantId")
      assert.deepStrictEqual([tenant?.required, tenant?.defaultValue], [true, "common"])
      assert.isTrue(oauth("microsoft-dynamics-365-business-central")?.scopes.includes("offline_access"))
      assert.strictEqual(oauth("salesforce")?.pkce, "S256")
      assert.deepStrictEqual(pieces.get("netsuite")?.authTypes, ["custom"])
      const business = ["netsuite", "odoo", "quickbooks", "xero", "zoho-books", "salesforce", "zoho-crm"]
      for (const piece of pieces.values()) {
        assert.strictEqual(piece.shard, piece.id.startsWith("microsoft-") || business.includes(piece.id) ? "business" : "core", piece.id)
      }
    }))
})
