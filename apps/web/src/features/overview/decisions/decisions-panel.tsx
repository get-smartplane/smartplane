import { Link } from "@tanstack/react-router"
import { ArrowRight, Plug } from "lucide-react"
import { Panel } from "@/components/layout/panel"
import { QueryView } from "@/components/query/query-view"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { dayBuckets, isCapped, latestDecisions } from "./day-buckets"
import { DecisionsChart } from "./decisions-chart"
import { DecisionsLegend } from "./decisions-legend"
import { decisionsAtom } from "./decisions-atom"
import { RecentDecisions } from "./recent-decisions"

/** What the gateway decided this week: totals, a daily chart, and the latest calls. */
export function DecisionsPanel() {
  return (
    <Panel
      title="Agent calls, last 7 days"
      action={
        <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" asChild>
          <Link to="/audit">
            Audit log
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      }
    >
      <QueryView atom={decisionsAtom} loading={<Skeleton className="m-4 h-56" />}>
        {(window) => {
          const days = dayBuckets(window)
          const recent = latestDecisions(window, 5)
          if (recent.length === 0) {
            return (
              <div className="flex flex-col items-start gap-3 p-4 text-sm">
                <p className="text-muted-foreground">No agent has called a tool through the gateway this week.</p>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/tokens">
                    <Plug />
                    Connect a client
                  </Link>
                </Button>
              </div>
            )
          }
          return (
            <>
              <div className="flex flex-col gap-5 p-4">
                <DecisionsLegend days={days} capped={(kind) => isCapped(window, kind)} />
                <DecisionsChart days={days} />
              </div>
              <h3 className="border-t bg-muted/45 px-4 py-2 text-xs font-semibold text-muted-foreground">Latest</h3>
              <RecentDecisions decisions={recent} />
            </>
          )
        }}
      </QueryView>
    </Panel>
  )
}
