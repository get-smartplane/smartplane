import { Link } from "@tanstack/react-router"
import { Check, ChevronsUpDown, Settings, UserPlus } from "lucide-react"
import { BrandMark } from "@/components/brand/brand-mark"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useCan, useMe } from "@/features/auth/me-context"

/** The org this session acts in. A session belongs to exactly one org, so this lists it rather than offering a switch. */
export function OrgSwitcher() {
  const { org } = useMe()
  const canManageMembers = useCan("members:manage")
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="gap-2.5 data-[state=open]:bg-sidebar-accent">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sky text-foreground">
                <BrandMark className="size-6" />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">{org.name}</span>
                <span className="truncate font-display text-xs font-[680] tracking-[-0.03em] text-sidebar-foreground/70">Smartplane</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-60" align="start">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Organization</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{org.name}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{org.slug}</span>
                </span>
                <Check className="text-brand" />
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {canManageMembers && (
              <DropdownMenuItem asChild>
                <Link to="/members">
                  <UserPlus />
                  Invite people
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings />
                Organization settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
