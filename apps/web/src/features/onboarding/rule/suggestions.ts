import type { GuardStarterId, Resource } from "@pc/domain"

/**
 * A rule to start from, with a call that would break it, so the inline test has something real to try. Each is a
 * prepared rule on the server (`starterId`): choosing one creates it already compiled and tested, with no verify.
 */
export interface RuleSuggestion {
  readonly starterId: GuardStarterId
  readonly label: string
  readonly rule: string
  readonly sample: { readonly tool: string; readonly arguments: Readonly<Record<string, unknown>> }
}

const secrets: RuleSuggestion = {
  starterId: "keep-secrets-out", label: "Keep secrets out",
  rule: "No tool call may send, print or return a password, API key or access token.",
  sample: { tool: "create_comment", arguments: { body: "Deploy key: AKIAIOSFODNN7EXAMPLE / wJalrXUtnFEMI/K7MDENG" } }
}

const byTool: Readonly<Record<string, ReadonlyArray<RuleSuggestion>>> = {
  github: [
    { starterId: "github-protect-main", label: "Protect main", rule: "Agents never push to, merge into or delete the main branch.", sample: { tool: "merge_pull_request", arguments: { repo: "acme/api", pull_number: 412, base: "main" } } },
    { starterId: "github-no-repo-deletions", label: "No repository deletions", rule: "Agents never delete a repository or change who has access to it.", sample: { tool: "delete_repository", arguments: { repo: "acme/api" } } },
    secrets
  ],
  linear: [
    { starterId: "linear-no-deleting-issues", label: "No deleting issues", rule: "Agents never delete issues, projects or cycles.", sample: { tool: "delete_issue", arguments: { id: "ENG-1024" } } },
    { starterId: "linear-no-customer-contacts", label: "Customer data stays out", rule: "Agents never put customer email addresses or phone numbers in an issue.", sample: { tool: "create_issue", arguments: { title: "Refund for jane@example.com", description: "Call her on +1 415 555 0100" } } },
    secrets
  ],
  slack: [
    { starterId: "slack-no-public-channels", label: "No public channels", rule: "Agents never post in public channels; direct messages and private channels are fine.", sample: { tool: "send_channel_message", arguments: { channel: "#general", text: "Deploy finished" } } },
    { starterId: "slack-no-channel-mentions", label: "No @channel", rule: "Agents never mention @channel, @here or @everyone.", sample: { tool: "send_channel_message", arguments: { channel: "#eng", text: "@channel the build is red" } } },
    secrets
  ],
  "google-drive": [
    { starterId: "drive-protect-finance-folder", label: "Protect a folder", rule: "Nobody deletes or moves files in the Finance folder.", sample: { tool: "delete_file", arguments: { path: "/Finance/Q3 forecast.xlsx" } } },
    { starterId: "drive-no-public-sharing", label: "No public sharing", rule: "Agents never share a file with people outside the company or make it public.", sample: { tool: "share_file", arguments: { file: "Roadmap 2027", with: "anyone with the link" } } },
    { starterId: "drive-keep-q3-reports", label: "Q3 reports stay", rule: "Nobody deletes reports from the Q3 folder.", sample: { tool: "delete_file", arguments: { path: "/reports/Q3/summary.pdf" } } }
  ],
  notion: [
    { starterId: "notion-no-deleting-pages", label: "No deleting pages", rule: "Agents never delete or archive a page.", sample: { tool: "archive_page", arguments: { page: "Engineering handbook" } } },
    { starterId: "notion-hr-off-limits", label: "HR is off limits", rule: "Agents never read or edit pages under HR.", sample: { tool: "get_page", arguments: { page: "HR / Salaries 2026" } } },
    secrets
  ],
  database: [
    { starterId: "database-read-only", label: "Read only", rule: "Agents never run INSERT, UPDATE, DELETE, DROP or ALTER statements.", sample: { tool: "query", arguments: { sql: "DELETE FROM invoices WHERE status = 'void'" } } },
    { starterId: "database-no-personal-data", label: "No personal data", rule: "Agents never select email, phone or address columns from the customers table.", sample: { tool: "query", arguments: { sql: "SELECT name, email, phone FROM customers" } } },
    { starterId: "database-no-bulk-exports", label: "No bulk exports", rule: "Agents never read more than 1,000 rows of customer data in one query.", sample: { tool: "query", arguments: { sql: "SELECT * FROM customers" } } }
  ],
  generic: [
    { starterId: "no-deletions", label: "No deletions", rule: "Agents never delete anything.", sample: { tool: "delete_file", arguments: { path: "/reports/Q3/summary.pdf" } } },
    { starterId: "production-read-only", label: "Production is read-only", rule: "Agents never change anything in production.", sample: { tool: "update_config", arguments: { environment: "production", replicas: 0 } } },
    secrets
  ]
}

/** Three rules that fit the tool connected in step one; general ones when there is none. */
export const suggestionsFor = (tool: Resource | undefined): ReadonlyArray<RuleSuggestion> => {
  const config = tool?.config
  const key = config?.kind === "integration" ? config.pieceId : config?.kind === "database" ? "database" : "generic"
  return byTool[key] ?? byTool["generic"] ?? []
}

/** For a rule written by hand there is no known sample; the test starts from a common risky call. */
export const freeTextSample: RuleSuggestion["sample"] = { tool: "delete_file", arguments: { path: "/reports/Q3/summary.pdf" } }
