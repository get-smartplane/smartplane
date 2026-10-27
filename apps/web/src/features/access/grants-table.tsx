import type { Grant } from "@pc/domain"
import { TableFrame } from "@/components/layout/table-frame"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { GrantRow } from "./grant-row"

export function GrantsTable({ grants }: { readonly grants: ReadonlyArray<Grant> }) {
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="hidden md:table-cell">Limited to</TableHead>
            <TableHead className="hidden md:table-cell">Expires</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {grants.map((grant) => (
            <GrantRow key={grant.id} grant={grant} />
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}
