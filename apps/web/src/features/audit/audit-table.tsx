import { useState } from "react"
import { TableFrame } from "@/components/layout/table-frame"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cursorKey, cursorQuery, latest, type AuditCursor } from "./audit-cursor"
import { AuditPageRows } from "./audit-page-rows"
import type { AuditSearch } from "./audit-search"

const pageSize = 50

/**
 * Cursor-paginated, newest first. Newer pages stack on top (`after`), older ones below (`before`), so
 * rows already on screen never move. Re-mount (via `key`) when filters change to restart from the top.
 */
export function AuditTable({ filters }: { readonly filters: AuditSearch }) {
  const [cursors, setCursors] = useState<ReadonlyArray<AuditCursor>>([latest])
  const loadNewer = (after: number) => setCursors((current) => [{ _tag: "Newer", after }, ...current])
  const loadOlder = (before: number) => setCursors((current) => [...current, { _tag: "Older", before }])
  return (
    <TableFrame>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">#</TableHead>
            <TableHead className="hidden sm:table-cell">Time</TableHead>
            <TableHead>Event</TableHead>
            <TableHead className="hidden sm:table-cell">Who</TableHead>
            <TableHead className="hidden lg:table-cell">What</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cursors.map((cursor, index) => (
            <AuditPageRows
              key={cursorKey(cursor)}
              query={{ ...filters, limit: pageSize, ...cursorQuery(cursor) }}
              {...(index === 0 ? { onLoadNewer: loadNewer } : {})}
              {...(index === cursors.length - 1 ? { onLoadOlder: loadOlder } : {})}
            />
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  )
}
