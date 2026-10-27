import type { Resource } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { catalogAtom } from "@/features/integrations/atoms"
import { PieceLogo } from "@/features/integrations/piece-logo"
import { kindMeta } from "@/features/resources/kinds"

/** A resource as a logo (or kind icon), its name and kind: how the setup flow names "your tool". */
export function ToolBadge({ resource }: { readonly resource: Resource }) {
  const pieces = useQueryData(catalogAtom, [])
  const config = resource.config
  const piece = config.kind === "integration" ? pieces.find((candidate) => candidate.id === config.pieceId) : undefined
  const meta = kindMeta[config.kind]
  const Icon = meta.icon
  return (
    <span className="flex min-w-0 items-center gap-3">
      {config.kind === "integration" ? (
        <PieceLogo url={piece?.logoUrl} name={piece?.displayName ?? resource.name} />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-semibold">{resource.name}</span>
        <span className="truncate text-xs text-muted-foreground">{piece !== undefined && piece.displayName !== resource.name ? piece.displayName : meta.label}</span>
      </span>
    </span>
  )
}
