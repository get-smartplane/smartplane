import type { ReactNode } from "react"
import { TableCell, TableRow } from "@/components/ui/table"
import { auditColumnCount } from "./audit-row"

/** A row spanning the whole log table, for paging controls and inline states. */
export function FullRow({ children }: { readonly children: ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={auditColumnCount} className="py-3 text-center">
        {children}
      </TableCell>
    </TableRow>
  )
}
