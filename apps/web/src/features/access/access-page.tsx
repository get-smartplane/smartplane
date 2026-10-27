import { ShieldHalf } from "lucide-react"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { useQueryData } from "@/components/query/use-query-data"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { allResourcesAtom } from "@/features/resources/atoms"
import { grantsAtom } from "./atoms"
import { CreateGrantDialog } from "./create-grant-dialog"
import { GrantMatrix } from "./grant-matrix"
import { GrantsTable } from "./grants-table"

export function AccessPage() {
  const resources = useQueryData(allResourcesAtom, [])
  return (
    <Page>
      <PageHeader
        title="Who can reach what"
        description="Grant people, teams and roles access to tools, data and secrets."
        actions={<CreateGrantDialog />}
      />
      <QueryView atom={grantsAtom}>
        {(grants) =>
          grants.length === 0 ? (
            <EmptyState
              icon={ShieldHalf}
              title="Nobody can reach anything yet"
              description="Access is closed by default. Grant a team, a role or a person access to a resource to open it up."
              action={<CreateGrantDialog />}
            />
          ) : (
            <Tabs defaultValue="list" className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {grants.length} {grants.length === 1 ? "grant" : "grants"} · each level includes the ones below it: read, use, write, admin.
                </p>
                <TabsList>
                  <TabsTrigger value="list">List</TabsTrigger>
                  <TabsTrigger value="matrix">Matrix</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="list">
                <GrantsTable grants={grants} />
              </TabsContent>
              <TabsContent value="matrix">
                <GrantMatrix grants={grants} resources={resources} />
              </TabsContent>
            </Tabs>
          )
        }
      </QueryView>
    </Page>
  )
}
