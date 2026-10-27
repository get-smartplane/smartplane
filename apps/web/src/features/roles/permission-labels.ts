import type { OrgPermission } from "@pc/domain"

export const permissionLabels: { readonly [P in OrgPermission]: { readonly label: string; readonly description: string } } = {
  "org:manage": { label: "Manage organization", description: "Org settings, SSO, directory sync and custom roles." },
  "members:manage": { label: "Manage members", description: "Invite, change roles and offboard members." },
  "teams:manage": { label: "Manage teams", description: "Create teams and change their membership." },
  "projects:manage": { label: "Manage projects", description: "Create, rename and archive projects." },
  "resources:read": { label: "View resources", description: "See the servers, tools and data sources shared with them." },
  "resources:browse": { label: "Browse the catalog", description: "See every resource in the org except secrets, granted or not." },
  "resources:manage": { label: "Manage resources", description: "Add resources and rotate secrets." },
  "grants:manage": { label: "Manage grants", description: "Grant and revoke access to resources." },
  "guards:manage": { label: "Manage rules", description: "Write, verify, test and activate rules." },
  "approvals:decide": { label: "Decide approvals", description: "Approve or reject agent calls a rule held." },
  "audit:read": { label: "Read audit log", description: "Search, verify and export the audit log." },
  "tokens:manage": { label: "Manage all tokens", description: "Service-account tokens and every member's tokens." },
  "reviews:manage": { label: "Run access reviews", description: "Create review campaigns, attest or revoke access, export evidence." }
}
