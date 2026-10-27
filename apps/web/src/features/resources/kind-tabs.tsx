import type { ResourceKind } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { useQueryData } from "@/components/query/use-query-data"
import { cn } from "@/lib/utils"
import { allResourcesAtom } from "./atoms"
import { catalogKinds, inCatalog, kindMeta } from "./kinds"

const tabClass = (active: boolean) =>
  cn(
    "inline-flex h-7 items-center gap-1.5 rounded-[3px] px-2.5 text-[0.8125rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    active ? "bg-card text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground"
  )

const Count = ({ value }: { readonly value: number }) => <span className="text-xs text-muted-foreground tabular-nums">{value}</span>

/** Kind filter as links, so the selected kind lives in the URL (`?kind=`); counts double as a summary. */
export function KindTabs({ kind }: { readonly kind: ResourceKind | undefined }) {
  // Secrets and variables live on their own page, so neither the tabs nor "All" count them.
  const resources = useQueryData(allResourcesAtom, []).filter(inCatalog)
  return (
    <nav className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Resource kinds">
      <div className="inline-flex gap-0.5 rounded-md bg-muted p-0.5">
        <Link to="/resources" search={{}} className={tabClass(kind === undefined)}>
          All
          <Count value={resources.length} />
        </Link>
        {catalogKinds.map((value) => {
          const { plural, icon: Icon } = kindMeta[value]
          return (
            <Link key={value} to="/resources" search={{ kind: value }} className={tabClass(kind === value)}>
              <Icon className="size-3.5" />
              {plural}
              <Count value={resources.filter((resource) => resource.config.kind === value).length} />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
