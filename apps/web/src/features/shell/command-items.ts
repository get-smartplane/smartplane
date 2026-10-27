import { hasPermission, type Principal } from "@pc/domain"
import { Blocks, Boxes, KeyRound, LockKeyhole, Plug, ShieldCheck, ShieldHalf, UserPlus, type LucideIcon } from "lucide-react"
import { navGroups, type NavItem } from "./nav-items"

export interface CommandItem extends NavItem {
  readonly group: "Go to" | "Do"
}

/** Shortcuts to the page where each task starts; the page holds the form. */
const tasks: ReadonlyArray<Omit<CommandItem, "group"> & { readonly icon: LucideIcon }> = [
  { to: "/tokens", label: "Connect an MCP client", icon: Plug, keywords: "claude cursor oauth setup" },
  { to: "/integrations", label: "Connect an integration", icon: Blocks, permission: "resources:manage", keywords: "github slack google notion catalog oauth" },
  { to: "/resources", label: "Add a resource", icon: Boxes, permission: "resources:manage", keywords: "mcp server database api" },
  { to: "/secrets", label: "Add or rotate a secret", icon: LockKeyhole, permission: "resources:manage", keywords: "credential api key token password variable" },
  { to: "/access", label: "Grant access", icon: ShieldHalf, permission: "grants:manage", keywords: "share allow" },
  { to: "/guards", label: "Write a rule", icon: ShieldCheck, permission: "guards:manage", keywords: "guard policy block" },
  { to: "/members", label: "Invite a member", icon: UserPlus, permission: "members:manage", keywords: "people email" },
  { to: "/tokens", label: "Create an access token", icon: KeyRound, keywords: "pc_ ci service account" }
]

export const commandItems = (principal: Principal): ReadonlyArray<CommandItem> => {
  const allowed = (item: NavItem) => item.permission === undefined || hasPermission(principal, item.permission)
  return [
    ...tasks.filter(allowed).map((item) => ({ ...item, group: "Do" as const })),
    ...navGroups.flatMap((group) => group.items).filter(allowed).map((item) => ({ ...item, group: "Go to" as const }))
  ]
}

export const matches = (item: CommandItem, query: string): boolean => {
  const haystack = `${item.label} ${item.keywords ?? ""}`.toLowerCase()
  return query.toLowerCase().split(/\s+/).every((word) => haystack.includes(word))
}
