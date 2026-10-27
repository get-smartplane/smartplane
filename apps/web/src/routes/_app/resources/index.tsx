import { createFileRoute, redirect } from "@tanstack/react-router"
import { Schema } from "effect"
import { ResourcesPage } from "@/features/resources/resources-page"
import { ResourceSearch } from "@/features/resources/resource-search"

export const Route = createFileRoute("/_app/resources/")({
  validateSearch: Schema.toStandardSchemaV1(ResourceSearch),
  // Old links to the secret and variable tabs land on their own page now.
  beforeLoad: ({ search }) => {
    if (search.kind === "secret" || search.kind === "variable") throw redirect({ to: "/secrets", replace: true })
  },
  component: function ResourcesRoute() {
    return <ResourcesPage search={Route.useSearch()} />
  }
})
