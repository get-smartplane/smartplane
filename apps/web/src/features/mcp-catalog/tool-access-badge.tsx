import type { ToolAccess } from "@pc/domain"
import { Badge } from "@/components/ui/badge"

const labels: { readonly [A in ToolAccess]: { readonly text: string; readonly variant: "outline" | "secondary" | "destructive"; readonly title: string } | null } = {
  read: { text: "Read", variant: "outline", title: "The server marks it read-only." },
  write: { text: "Write", variant: "secondary", title: "Changes data, but the server says it is not destructive." },
  destructive: { text: "Destructive", variant: "destructive", title: "May delete or overwrite data, per the server's hints." },
  unknown: null
}

/** The server's own read/write hint for a tool. Hints guide people; grants and guards still decide. */
export function ToolAccessBadge({ access }: { readonly access: ToolAccess }) {
  const label = labels[access]
  if (label === null) return null
  return (
    <Badge variant={label.variant} title={label.title} className="shrink-0">
      {label.text}
    </Badge>
  )
}
