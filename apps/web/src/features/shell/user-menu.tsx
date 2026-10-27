import { useAtomSet } from "@effect/atom-react"
import { ChevronsUpDown, LifeBuoy, LogOut, Monitor, Moon, Sun } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { ThemePreference } from "@/components/theme/theme"
import { useTheme } from "@/components/theme/theme-context"
import { useMe } from "@/features/auth/me-context"
import { Schema } from "effect"
import { logoutAtom } from "./logout-atom"
import { principalLabel } from "./principal-label"

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor }
] as const

const isThemePreference = Schema.is(ThemePreference)

export function UserMenu() {
  const { principal } = useMe()
  const { preference, setPreference } = useTheme()
  const logout = useAtomSet(logoutAtom, { mode: "promise" })
  const { name, detail, initials } = principalLabel(principal)

  const signOut = async () => window.location.assign(await logout())

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8 rounded-md">
                <AvatarFallback className="rounded-md bg-sky text-xs font-semibold text-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-sidebar-accent-foreground">{name}</span>
                <span className="truncate text-xs text-sidebar-foreground/60 capitalize">{detail}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side="top" align="end">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">Role: {principal.role}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={preference}
              onValueChange={(value) => isThemePreference(value) && setPreference(value)}
            >
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon />
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="https://smartplane.dev/security" target="_blank" rel="noreferrer">
                <LifeBuoy />
                Help and security
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
