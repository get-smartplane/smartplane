import { hasPermission } from "@pc/domain"
import { Link, useLocation } from "@tanstack/react-router"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@/components/ui/sidebar"
import { useMe } from "@/features/auth/me-context"
import type { NavGroup as NavGroupModel } from "./nav-items"
import { PendingBadge } from "./pending-badge"

export const isActivePath = (pathname: string, to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to))

export function NavGroup({ group }: { readonly group: NavGroupModel }) {
  const { principal } = useMe()
  const pathname = useLocation({ select: (location) => location.pathname })
  const items = group.items.filter((item) => item.permission === undefined || hasPermission(principal, item.permission))
  if (items.length === 0) return null

  return (
    <SidebarGroup className="py-1">
      <SidebarGroupLabel className="h-7 text-xs font-semibold text-sidebar-foreground/65">{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-px">
          {items.map(({ to, label, icon: Icon, badge }) => (
            <SidebarMenuItem key={to}>
              <SidebarMenuButton
                asChild
                isActive={isActivePath(pathname, to)}
                tooltip={label}
                className="h-8 text-[0.875rem] font-medium text-sidebar-foreground data-active:bg-card data-active:font-semibold data-active:text-sidebar-accent-foreground data-active:ring-1 data-active:ring-sidebar-border data-active:[&>svg]:text-sidebar-primary dark:data-active:bg-sidebar-accent dark:data-active:ring-0 [&>svg]:text-sidebar-foreground/70"
              >
                <Link to={to}>
                  <Icon />
                  <span>{label}</span>
                  {badge === "approvals" && <PendingBadge />}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
