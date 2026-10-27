import { mcpCatalog, type Resource, sameServerUrl } from "@pc/domain"

/** A product a rule may name, with the words people use for it and how org resources point at it. */
export interface Product {
  readonly key: string
  readonly name: string
  /** Lower-case words or phrases matched on word boundaries; the name itself is always one. */
  readonly aliases: ReadonlyArray<string>
  readonly pieceIds: ReadonlyArray<string>
  readonly catalogSlugs: ReadonlyArray<string>
}

const product = (key: string, name: string, aliases: ReadonlyArray<string> = [], pieceIds: ReadonlyArray<string> = [key], catalogSlugs: ReadonlyArray<string> = [key]): Product =>
  ({ key, name, aliases: [name.toLowerCase(), ...aliases], pieceIds, catalogSlugs })

/**
 * Products of the bundled integrations and the MCP catalog. Aliases are the short forms people write in
 * rules ("gh", "jira", "drive"); deliberately no plain English words that would match unrelated rules.
 */
export const products: ReadonlyArray<Product> = [
  product("notion", "Notion"),
  product("linear", "Linear"),
  product("github", "GitHub", ["gh", "git hub"]),
  product("gitlab", "GitLab"),
  product("atlassian", "Atlassian", ["jira", "confluence", "jira cloud"], ["jira-cloud", "confluence"], ["atlassian"]),
  product("slack", "Slack"),
  product("google-drive", "Google Drive", ["drive", "gdrive", "g drive"]),
  product("google-sheets", "Google Sheets", ["gsheets", "google sheet"]),
  product("google-calendar", "Google Calendar", ["gcal"]),
  product("gmail", "Gmail", ["google mail"]),
  product("discord", "Discord"),
  product("stripe", "Stripe"),
  product("asana", "Asana"),
  product("trello", "Trello"),
  product("todoist", "Todoist"),
  product("figma", "Figma"),
  product("zendesk", "Zendesk"),
  product("salesforce", "Salesforce", ["sfdc"]),
  product("zoho-crm", "Zoho CRM"),
  product("resend", "Resend"),
  product("microsoft-outlook", "Outlook", ["microsoft outlook", "ms outlook"]),
  product("microsoft-teams", "Microsoft Teams", ["ms teams"]),
  product("microsoft-onedrive", "OneDrive", ["one drive"]),
  product("microsoft-sharepoint", "SharePoint", ["share point"]),
  product("microsoft-excel-365", "Excel"),
  product("quickbooks", "QuickBooks", ["qbo"]),
  product("xero", "Xero"),
  product("netsuite", "NetSuite"),
  product("sentry", "Sentry", [], [], ["sentry"]),
  product("vercel", "Vercel", [], [], ["vercel"]),
  product("supabase", "Supabase", [], [], ["supabase"]),
  product("cloudflare", "Cloudflare", [], [], ["cloudflare"]),
  product("neon", "Neon", [], [], ["neon"]),
  product("netlify", "Netlify", [], [], ["netlify"]),
  product("hugging-face", "Hugging Face", ["huggingface"], [], ["hugging-face"]),
  product("square", "Square", [], [], ["square"]),
  product("intercom", "Intercom", [], [], ["intercom"]),
  product("monday", "monday.com", [], [], ["monday"]),
  product("webflow", "Webflow", [], [], ["webflow"]),
  product("canva", "Canva", [], [], ["canva"]),
  product("zapier", "Zapier", [], [], ["zapier"])
]

const titleCase = (id: string) => id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")

/** The catalog server an MCP resource points at, by URL. */
export const catalogEntryOf = (resource: Resource) => {
  const config = resource.config
  return config.kind === "mcp_server" ? mcpCatalog.find((entry) => sameServerUrl(entry.url, config.url)) : undefined
}

/** The known product a resource is: an integration by its piece, an MCP server by its catalog URL. */
export const productOf = (resource: Resource): Product | undefined => {
  const config = resource.config
  if (config.kind === "integration") return products.find((p) => p.pieceIds.includes(config.pieceId))
  const entry = catalogEntryOf(resource)
  return entry === undefined ? undefined : products.find((p) => p.catalogSlugs.includes(entry.slug))
}

/** What to call the product a resource is, for people and the classifier: "Notion", else the piece or resource name. */
export const productName = (resource: Resource): string => {
  const known = productOf(resource)
  if (known !== undefined) return known.name
  const config = resource.config
  if (config.kind === "integration") return titleCase(config.pieceId)
  return catalogEntryOf(resource)?.name ?? resource.name
}
