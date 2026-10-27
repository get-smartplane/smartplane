import type { IntegrationShard } from "@pc/domain"

/**
 * The pieces Smartplane bundles. Each must load, run without Activepieces server APIs for most of its
 * actions, and connect with a credential Smartplane can hold (API key, basic, custom fields or OAuth2).
 * To add one: `bun add @activepieces/piece-<id>` in packages/integrations, list it here in a shard, then
 * `bun run generate` (rewrites the catalog and each shard's piece registry).
 */
export interface CuratedPiece {
  readonly id: string
  readonly packageName: string
  /** The runner Worker that bundles it (`shards.ts`). */
  readonly shard: IntegrationShard
  /** OAuth2 scopes Smartplane adds to the piece's own; each use says why. */
  readonly extraScopes?: ReadonlyArray<string>
}

const inShard = (shard: IntegrationShard) => (id: string, options: Pick<CuratedPiece, "extraScopes"> = {}): CuratedPiece => ({
  id,
  packageName: `@activepieces/piece-${id}`,
  shard,
  ...options
})

/** Developer and collaboration tools: the original runner Worker. */
const core = inShard("core")
/** Microsoft 365, ERP and CRM: a second Worker keeps both bundles well under the size and startup limits. */
const business = inShard("business")

export const curatedPieces: ReadonlyArray<CuratedPiece> = [
  // Engineering
  core("github"),
  core("gitlab"),
  core("linear"),
  core("jira-cloud"),
  // Knowledge and work management
  core("notion"),
  core("confluence"),
  core("asana"),
  core("trello"),
  core("todoist"),
  // Design
  core("figma"),
  // Google Workspace
  core("google-sheets"),
  core("google-drive"),
  core("google-calendar"),
  core("gmail"),
  // Communication
  core("slack"),
  core("discord"),
  core("resend"),
  // Customer and revenue
  core("zendesk"),
  core("stripe"),
  // Generic HTTP: prefer an `api` resource for one known API; this is for agents that must call arbitrary URLs.
  core("http"),
  // Microsoft 365
  business("microsoft-outlook"),
  business("microsoft-outlook-calendar"),
  business("microsoft-excel-365"),
  business("microsoft-onedrive"),
  business("microsoft-sharepoint"),
  business("microsoft-teams"),
  business("microsoft-todo"),
  business("microsoft-365-people"),
  // ERP and finance. Business Central's piece asks no `offline_access`, so Microsoft would issue no refresh
  // token and the connection would lapse after an hour.
  business("microsoft-dynamics-365-business-central", { extraScopes: ["offline_access"] }),
  business("microsoft-dynamics-crm"),
  business("netsuite"),
  business("odoo"),
  business("quickbooks"),
  business("xero"),
  business("zoho-books"),
  // CRM
  business("salesforce"),
  business("zoho-crm")
]
