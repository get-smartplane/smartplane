const google = "Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web application) → Authorized redirect URIs."

/** Where each provider keeps an OAuth app's redirect URIs, in one line. */
const hints: Readonly<Record<string, string>> = {
  github: "GitHub → Settings → Developer settings → OAuth Apps → your app → Authorization callback URL.",
  gitlab: "GitLab → Preferences → Applications → your application → Redirect URI.",
  slack: "api.slack.com/apps → your app → OAuth & Permissions → Redirect URLs.",
  notion: "notion.so/my-integrations → your public integration → OAuth domain & URIs → Redirect URIs.",
  asana: "Asana developer console → your app → OAuth → Redirect URLs.",
  todoist: "Todoist App Management console → your app → OAuth redirect URL.",
  zendesk: "Zendesk Admin Center → Apps and integrations → APIs → OAuth Clients → Redirect URLs.",
  "google-sheets": google,
  "google-drive": google,
  "google-calendar": google,
  gmail: google
}

export const redirectHint = (pieceId: string, pieceName: string): string =>
  hints[pieceId] ?? `Register it as the redirect (callback) URL of your OAuth app at ${pieceName}.`
