import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { SetupPage } from "@/features/onboarding/setup/setup-page"
import { SetupSearch } from "@/features/onboarding/setup/setup-search"

export const Route = createFileRoute("/_focus/setup")({
  validateSearch: Schema.toStandardSchemaV1(SetupSearch),
  component: function SetupRoute() {
    return <SetupPage search={Route.useSearch()} />
  }
})
