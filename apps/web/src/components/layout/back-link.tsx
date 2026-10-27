import { Link, type LinkProps } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

interface BackLinkProps {
  readonly to: NonNullable<LinkProps["to"]>
  /** Query to land on (a list filtered to the detail's kind). */
  readonly search?: LinkProps["search"]
  readonly children: string
}

/** The way back from a detail page to its list. Its label is the list's name in the sidebar, so the two agree. */
export function BackLink({ to, search, children }: BackLinkProps) {
  return (
    <Link
      to={to}
      search={search}
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      {children}
    </Link>
  )
}
