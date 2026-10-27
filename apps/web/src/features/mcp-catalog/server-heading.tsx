import type { McpCatalogEntry } from "@pc/domain"
import { PieceLogo } from "@/features/integrations/piece-logo"
import { categoryLabel } from "./categories"

/** Logo, name and the one sentence: how a catalog server introduces itself in the connect form. */
export function ServerHeading({ entry }: { readonly entry: McpCatalogEntry }) {
  return (
    <div className="flex items-start gap-3">
      <PieceLogo url={entry.logoUrl} name={entry.name} size="lg" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">
          {entry.vendor} · {categoryLabel[entry.category]}
        </span>
        <p className="text-sm text-pretty">{entry.description}</p>
      </div>
    </div>
  )
}
