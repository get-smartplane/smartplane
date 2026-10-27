import { Blocks } from "lucide-react"
import { useState } from "react"
import { matchesQuery, SearchInput } from "@/components/form/search-input"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { Section } from "@/components/layout/section"
import { SegmentedFilter } from "@/components/layout/segmented-filter"
import { QueryView } from "@/components/query/query-view"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import type { ConnectionReturn } from "@/features/connections/connection-return"
import { mcpCatalogAtom } from "@/features/mcp-catalog/atoms"
import { PopularServers } from "@/features/mcp-catalog/popular-servers"
import { useCatalogReturn } from "@/features/mcp-catalog/use-catalog-return"
import { resourcesAtom } from "@/features/resources/atoms"
import { catalogAtom } from "./atoms"
import { categoriesOf, categoryLabel } from "./category"
import { ConnectedIntegrations } from "./connected-integrations"
import { OAuthFailureAlert } from "./oauth-failure-alert"
import { PieceCard } from "./piece-card"

const all = "all"

/**
 * Every way to connect a tool, without making anyone choose a mechanism: official MCP servers first (one
 * sign-in), then the bundled integrations. A product offered both ways shows once, as its MCP server, whose
 * dialog lists the integration under "Other ways to connect".
 */
export function CatalogPage({ search }: { readonly search: ConnectionReturn }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState(all)
  const failure = useCatalogReturn(search)
  const servers = useQueryData(mcpCatalogAtom, [])
  const viaServer = new Set(servers.flatMap(({ entry }) => (entry.pieceId === undefined ? [] : [entry.pieceId])))
  const integrations = useQueryData(resourcesAtom({ kind: "integration" }), [])
  const connectedCount = (pieceId: string) =>
    integrations.filter((resource) => resource.config.kind === "integration" && resource.config.pieceId === pieceId).length

  return (
    <Page>
      <PageHeader
        title="Connect your tools"
        description="Pick a tool your team already uses. Its actions become tools your agents can call, once you grant access."
      />
      {failure && <OAuthFailureAlert failure={failure} />}
      <SearchInput label="Search tools" value={query} onChange={setQuery} className="sm:w-80" />
      <PopularServers items={servers} query={query} />
      <QueryView atom={catalogAtom}>
        {(allPieces) => {
          const pieces = allPieces.filter((piece) => !viaServer.has(piece.id))
          const shown = pieces.filter(
            (piece) =>
              (category === all || piece.categories.includes(category)) &&
              matchesQuery(query, [piece.id, piece.displayName, piece.description, ...piece.categories.map(categoryLabel)])
          )
          const clear = () => {
            setQuery("")
            setCategory(all)
          }
          return (
            <>
              {integrations.length > 0 && (
                <Section title="Connected" aside={integrations.length}>
                  <ConnectedIntegrations integrations={integrations} pieces={allPieces} />
                </Section>
              )}
              <Section title="More tools" aside={`${shown.length} of ${pieces.length}`}>
                <div className="flex flex-col gap-2">
                  <SegmentedFilter
                    label="Category"
                    value={category}
                    onChange={setCategory}
                    segments={[
                      { value: all, label: "All", count: pieces.length },
                      ...categoriesOf(pieces).map((value) => ({
                        value,
                        label: categoryLabel(value),
                        count: pieces.filter((piece) => piece.categories.includes(value)).length
                      }))
                    ]}
                  />
                </div>
                {shown.length === 0 ? (
                  <EmptyState
                    icon={Blocks}
                    title="No integration matches"
                    description="Try another word or category. Tools outside the catalog can still be added as an MCP server or an API under Resources."
                    action={<Button variant="outline" onClick={clear}>Clear filters</Button>}
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {shown.map((piece) => (
                      <PieceCard key={piece.id} piece={piece} connected={connectedCount(piece.id)} />
                    ))}
                  </div>
                )}
              </Section>
            </>
          )
        }}
      </QueryView>
    </Page>
  )
}
