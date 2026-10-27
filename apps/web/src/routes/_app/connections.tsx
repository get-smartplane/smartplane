import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { ConnectionReturn } from "@/features/connections/connection-return"
import { MyConnectionsPage } from "@/features/connections/my-connections-page"

export const Route = createFileRoute("/_app/connections")({
  validateSearch: Schema.toStandardSchemaV1(ConnectionReturn),
  component: function ConnectionsRoute() {
    return <MyConnectionsPage search={Route.useSearch()} />
  }
})
