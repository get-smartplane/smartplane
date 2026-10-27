import { Link } from "@tanstack/react-router"
import { Panel } from "@/components/layout/panel"
import { QueryView } from "@/components/query/query-view"
import { allResourcesAtom } from "@/features/resources/atoms"
import { catalogKinds, kindMeta } from "@/features/resources/kinds"

/** What the gateway can put in front of an agent, by kind; each row opens that slice of the catalog. */
export function ReachByKind() {
  // What agents call; secrets and variables (credentials and settings for these) have their own page.
  const kinds = catalogKinds
  return (
    <Panel title="Reachable through the gateway">
      <QueryView atom={allResourcesAtom}>
        {(resources) => (
          <ul className="grid grid-cols-2 gap-px bg-border lg:grid-cols-1 [&>li:last-child:nth-child(odd)]:col-span-2 lg:[&>li:last-child:nth-child(odd)]:col-span-1">
            {kinds.map((kind) => {
              const { plural, icon: Icon } = kindMeta[kind]
              const count = resources.filter((resource) => resource.config.kind === kind).length
              return (
                <li key={kind} className="bg-card">
                  <Link
                    to="/resources"
                    search={{ kind }}
                    className="flex h-10 items-center gap-2.5 px-4 text-sm transition-colors hover:bg-accent/40"
                  >
                    <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                    <span className={count === 0 ? "text-muted-foreground" : "font-medium"}>{plural}</span>
                    <span className="ml-auto font-semibold tabular-nums">{count}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </QueryView>
    </Panel>
  )
}
