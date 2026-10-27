import { Link } from "@tanstack/react-router"
import { Section } from "@/components/layout/section"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCan } from "@/features/auth/me-context"
import { ConnectPanel } from "./connect-panel"
import { CreateTokenDialog } from "./create-token-dialog"
import { TokenList } from "./token-list"

export function TokensPage() {
  const canManage = useCan("tokens:manage")
  const canManageResources = useCan("resources:manage")
  const canManageMachineTokens = canManage && canManageResources
  return (
    <Page>
      <PageHeader
        title="Connect & tokens"
        description="Point any MCP client at Smartplane. It sees only what you may use."
        actions={<CreateTokenDialog />}
      />
      <ConnectPanel />
      <Section
        title="Access tokens"
        description={
          <>
            Each expires within 90 days and stops working the moment its owner is offboarded.
            {canManageMachineTokens && (
              <>
                {" "}A deployed service that needs secrets at boot gets a{" "}
                <Link to="/secrets" hash="machine-tokens" className="font-medium text-foreground underline underline-offset-4">
                  machine token
                </Link>{" "}
                instead.
              </>
            )}
          </>
        }
      >
        {canManage ? (
          <Tabs defaultValue="mine" className="gap-3">
            <TabsList>
              <TabsTrigger value="mine">Mine</TabsTrigger>
              <TabsTrigger value="all">Everyone's</TabsTrigger>
            </TabsList>
            <TabsContent value="mine">
              <TokenList scope="mine" />
            </TabsContent>
            <TabsContent value="all">
              <TokenList scope="all" />
            </TabsContent>
          </Tabs>
        ) : (
          <TokenList scope="mine" />
        )}
      </Section>
    </Page>
  )
}
