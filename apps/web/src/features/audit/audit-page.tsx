import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { AuditFilters } from "./audit-filters"
import type { AuditSearch } from "./audit-search"
import { AuditTable } from "./audit-table"
import { ChainBadge } from "./chain-badge"
import { ExportDialog } from "./export-dialog"

export function AuditPage({ search }: { readonly search: AuditSearch }) {
  return (
    <Page>
      <PageHeader
        title="Audit log"
        description="Every sign-in, change and agent call, in a record nobody can quietly edit. Open a row for its details."
        status={<ChainBadge />}
        actions={<ExportDialog />}
      />
      <AuditFilters search={search} />
      <AuditTable key={JSON.stringify(search)} filters={search} />
    </Page>
  )
}
