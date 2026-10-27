import type { Guard } from "@pc/domain"
import { RotateCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { GuardRow } from "../guards-table"
import type { QuickRule } from "./use-quick-add"

/**
 * One rule typed in the quick-add row: the real rule once the list has it, and until then its text with
 * "Saving", or "Not saved" with Retry and Dismiss when the save failed.
 */
export function QuickRuleRow({ rule, guard, now, onRetry, onDismiss }: {
  readonly rule: QuickRule
  readonly guard: Guard | undefined
  readonly now: number
  readonly onRetry: () => void
  readonly onDismiss: () => void
}) {
  if (guard !== undefined) return <GuardRow guard={guard} now={now} />
  const failed = rule.state === "failed"
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="whitespace-normal">
        <p className="font-semibold break-words text-muted-foreground">{rule.rule}</p>
      </TableCell>
      <TableCell className="hidden sm:table-cell" />
      <TableCell className="hidden md:table-cell" />
      <TableCell>
        {failed ? (
          <span className="flex items-center gap-1">
            <span className="mr-1 text-xs font-semibold text-destructive">Not saved</span>
            <Button size="icon-xs" variant="ghost" aria-label={`Retry adding “${rule.rule}”`} onClick={onRetry}>
              <RotateCw />
            </Button>
            <Button size="icon-xs" variant="ghost" aria-label={`Dismiss “${rule.rule}”`} onClick={onDismiss}>
              <X />
            </Button>
          </span>
        ) : (
          // Saving takes a moment; a spinner here would only flicker.
          <span className="text-xs text-muted-foreground">Saving…</span>
        )}
      </TableCell>
    </TableRow>
  )
}
