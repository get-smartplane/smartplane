import { RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function DirectoryBadge() {
  return (
    <Badge variant="secondary">
      <RefreshCw />
      Directory sync
    </Badge>
  )
}
