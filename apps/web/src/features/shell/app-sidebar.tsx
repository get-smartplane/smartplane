import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from "@/components/ui/sidebar"
import { NavGroup } from "./nav-group"
import { navGroups } from "./nav-items"
import { OrgSwitcher } from "./org-switcher"
import { UserMenu } from "./user-menu"

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-2 pt-3">
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent className="gap-1 pt-1">
        {navGroups.map((group) => (
          <NavGroup key={group.label} group={group} />
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
