import type { PieceId } from "@pc/domain"
import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { BackLink } from "@/components/layout/back-link"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { useQueryData } from "@/components/query/use-query-data"
import { useCan } from "@/features/auth/me-context"
import { resourcesAtom } from "@/features/resources/atoms"
import { ActionList } from "./actions/action-list"
import { isOffered } from "./actions/action-groups"
import { pieceAtom } from "./atoms"
import { authTypeLabel } from "./auth-methods"
import { categoryLabel } from "./category"
import { ConnectDialog } from "./connect/connect-dialog"
import { PieceLogo } from "./piece-logo"

/** A catalog piece: what agents could do with it, and one button to connect it. */
export function PieceDetailPage({ pieceId }: { readonly pieceId: PieceId }) {
  const canManage = useCan("resources:manage")
  const existing = useQueryData(resourcesAtom({ kind: "integration" }), []).filter(
    (resource) => resource.config.kind === "integration" && resource.config.pieceId === pieceId
  )
  return (
    <Page>
      <QueryView atom={pieceAtom(pieceId)}>
        {(piece) => (
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-3">
              <BackLink to="/integrations">Integrations</BackLink>
              <div className="flex items-start gap-4">
                <PieceLogo url={piece.logoUrl} name={piece.displayName} size="lg" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <PageHeader
                    title={piece.displayName}
                    description={piece.description || `Use ${piece.displayName} from your agents.`}
                    actions={canManage ? <ConnectDialog piece={piece} /> : <span className="text-sm text-muted-foreground">Ask an admin to connect it.</span>}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground sm:pl-16">
                {piece.actions.filter(isOffered).length} actions agents can use · connects with{" "}
                {piece.authTypes.map((type) => authTypeLabel[type]).join(" or ")} · {piece.categories.map(categoryLabel).join(", ")} · v{piece.version}
              </p>
            </div>
            {existing.length > 0 && (
              <ul className="flex flex-col gap-1.5 rounded-xl border bg-card px-4 py-3 text-sm">
                {existing.map((resource) => (
                  <li key={resource.id}>
                    <Link to="/resources/$resourceId" params={{ resourceId: resource.id }} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                      Already connected as {resource.name}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <ActionList actions={piece.actions} revealHidden />
          </div>
        )}
      </QueryView>
    </Page>
  )
}
