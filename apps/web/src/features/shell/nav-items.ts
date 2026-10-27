import type { OrgPermission } from "@pc/domain"
import type { LinkProps } from "@tanstack/react-router"
import {
  Blocks,
  Boxes,
  CircleCheckBig,
  ClipboardCheck,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  PlugZap,
  ScrollText,
  Settings,
  ShieldCheck,
  ShieldHalf,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon
} from "lucide-react"

export interface NavItem {
  readonly to: NonNullable<LinkProps["to"]>
  readonly label: string
  readonly icon: LucideIcon
  /** Hidden from principals without it; the page itself would only show Forbidden. */
  readonly permission?: OrgPermission
  /** Shows a live count beside the label. */
  readonly badge?: "approvals"
  /** Extra words the command menu matches on. */
  readonly keywords?: string
}

export interface NavGroup {
  readonly label: string
  readonly items: ReadonlyArray<NavItem>
}

export const navGroups: ReadonlyArray<NavGroup> = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard, keywords: "home dashboard" },
      { to: "/members", label: "Members", icon: Users, keywords: "people invite offboard" },
      { to: "/teams", label: "Teams", icon: UsersRound, keywords: "groups" },
      { to: "/projects", label: "Projects", icon: FolderKanban, keywords: "scope" }
    ]
  },
  {
    label: "Access",
    items: [
      { to: "/integrations", label: "Integrations", icon: Blocks, permission: "resources:read", keywords: "connect github slack google notion linear jira catalog oauth" },
      { to: "/resources", label: "Resources", icon: Boxes, permission: "resources:read", keywords: "mcp server tool skill database api" },
      // Members reach variables shared with them from Resources; only managers see secrets at all.
      { to: "/secrets", label: "Secrets & variables", icon: LockKeyhole, permission: "resources:manage", keywords: "secret variable credential api key token password rotate config env" },
      { to: "/access", label: "Grants", icon: ShieldHalf, permission: "grants:manage", keywords: "access permissions who can" },
      { to: "/guards", label: "Rules", icon: ShieldCheck, permission: "guards:manage", keywords: "guards policy classifier" },
      // No permission gate: a rule can name anyone as its approver, and the list holds only what the viewer may decide.
      { to: "/approvals", label: "Approvals", icon: CircleCheckBig, badge: "approvals", keywords: "held pending" },
      { to: "/tokens", label: "Connect & tokens", icon: KeyRound, keywords: "access token mcp client claude cursor oauth" },
      { to: "/connections", label: "My connections", icon: PlugZap, keywords: "account sign in personal key oauth per-user" }
    ]
  },
  {
    label: "Compliance",
    items: [
      { to: "/audit", label: "Audit log", icon: ScrollText, permission: "audit:read", keywords: "events history evidence export" },
      { to: "/reviews", label: "Access reviews", icon: ClipboardCheck, permission: "reviews:manage", keywords: "attestation soc 2" }
    ]
  },
  {
    label: "Settings",
    items: [
      { to: "/roles", label: "Roles", icon: UserCog, keywords: "permissions" },
      { to: "/settings", label: "Organization", icon: Settings, keywords: "sso scim directory encryption keys retention" }
    ]
  }
]
