import type { AccountMode, CatalogServerConnected } from "@pc/domain"
import { ArrowRight } from "lucide-react"
import { useState } from "react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { OAuthFailureAlert } from "@/features/integrations/oauth-failure-alert"
import { mcpCatalogAtom } from "@/features/mcp-catalog/atoms"
import { CatalogConnectForm } from "@/features/mcp-catalog/connect-form"
import type { SetupSearch } from "../setup/setup-search"
import { StepFrame } from "../setup/step-frame"
import type { SetupController } from "../setup/use-setup"
import { useSetupTool } from "../setup/use-setup-tool"
import { AccountChoice } from "./account-choice"
import { ConnectedTool } from "./connected-tool"
import { McpServerForm } from "./mcp-server-form"
import { PieceConnect } from "./piece-connect"
import { PostgresForm } from "./postgres-form"
import { ToolPicker } from "./tool-picker"
import { isPiece, serverSlugOf, type ToolChoice } from "./tool-options"
import { useSetupOAuthReturn } from "./use-setup-oauth-return"
import { useToolConnected } from "./use-tool-connected"

/** Pieces and MCP servers by URL ask here; catalog servers ask in their own connect form. */
const offersAccountChoice = (choice: ToolChoice) => choice !== "postgres" && serverSlugOf(choice) === null

export function ToolStep({ controller, search }: { readonly controller: SetupController; readonly search: SetupSearch }) {
  const tool = useSetupTool(controller.setup)
  const [changing, setChanging] = useState(false)
  const [choice, setChoice] = useState<ToolChoice | null>(null)
  const [mode, setMode] = useState<AccountMode>("shared")
  const connected = useToolConnected(controller, choice !== null && offersAccountChoice(choice) ? mode : "shared")
  const { failure } = useSetupOAuthReturn(controller, search, tool?.name ?? "The provider")
  const picking = tool === undefined || changing
  const servers = useQueryData(mcpCatalogAtom, [])
  const server = choice === null ? undefined : servers.find(({ entry }) => entry.slug === serverSlugOf(choice))
  /** A shared sign-in continues at the provider and comes back to this step; anything else is done now. */
  const serverConnected = async ({ resource, authorizeUrl }: CatalogServerConnected) => {
    if (authorizeUrl === null) return controller.finish("done", { toolResourceId: resource.id })
    if (await controller.save({ toolResourceId: resource.id })) window.location.assign(authorizeUrl)
  }

  return (
    <StepFrame
      index={0}
      title="Connect your first tool"
      description="Agents reach it through Smartplane and never see its credentials. You get full access right away; the next step decides who else can use it."
      onSkip={() => void controller.finish("skipped")}
      skipping={controller.saving}
      primary={
        picking ? undefined : (
          <Button onClick={() => void controller.finish("done")} disabled={controller.saving}>
            Continue
            <ArrowRight />
          </Button>
        )
      }
    >
      {failure && <OAuthFailureAlert failure={failure} />}
      {picking ? (
        <>
          <ToolPicker servers={servers} value={choice} onChange={setChoice} />
          {choice !== null && (
            <div key={choice} className="flex animate-reveal flex-col gap-5 rounded-xl bg-muted/55 p-4 sm:p-5">
              {offersAccountChoice(choice) && <AccountChoice value={mode} onChange={setMode} />}
              {server ? (
                <CatalogConnectForm entry={server.entry} returnTo="setup" onConnected={(connected) => void serverConnected(connected)} />
              ) : isPiece(choice) ? (
                <PieceConnect pieceId={choice} onConnected={({ resource, authorizeUrl }) => void connected(resource, authorizeUrl)} />
              ) : choice === "mcp" ? (
                <McpServerForm onCreated={(resource) => connected(resource, null)} />
              ) : (
                <PostgresForm onCreated={(resource) => connected(resource, null)} />
              )}
            </div>
          )}
          {tool && (
            <Button variant="link" className="w-fit px-0" onClick={() => setChanging(false)}>
              Keep {tool.name}
            </Button>
          )}
        </>
      ) : (
        <ConnectedTool resource={tool} onChange={() => setChanging(true)} />
      )}
    </StepFrame>
  )
}
