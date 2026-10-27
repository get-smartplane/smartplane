import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { AuditPage } from "@/features/audit/audit-page"
import { AuditSearch } from "@/features/audit/audit-search"

export const Route = createFileRoute("/_app/audit")({
  validateSearch: Schema.toStandardSchemaV1(AuditSearch),
  component: function AuditRoute() {
    return <AuditPage search={Route.useSearch()} />
  }
})
