import { useLocation } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useMe } from "@/features/auth/me-context"
import { CommandMenu } from "./command-menu"
import { currentSection } from "./current-section"

export function AppHeader() {
  const { org } = useMe()
  const pathname = useLocation({ select: (location) => location.pathname })
  const section = currentSection(pathname)
  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 md:px-5">
      <SidebarTrigger className="-ml-1 text-muted-foreground" />
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="hidden truncate text-muted-foreground sm:inline">{org.name}</span>
        {section && (
          <>
            <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/60 sm:inline" aria-hidden="true" />
            <span className="truncate font-semibold">{section.label}</span>
          </>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <CommandMenu />
      </div>
    </header>
  )
}
