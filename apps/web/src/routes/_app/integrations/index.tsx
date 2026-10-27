import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { ConnectionReturn } from "@/features/connections/connection-return"
import { CatalogPage } from "@/features/integrations/catalog-page"

export const Route = createFileRoute("/_app/integrations/")({
  validateSearch: Schema.toStandardSchemaV1(ConnectionReturn),
  component: function IntegrationsRoute() {
    return <CatalogPage search={Route.useSearch()} />
  }
})
