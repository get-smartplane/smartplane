import type { Guard } from "@pc/domain"
import { Link, useNavigate } from "@tanstack/react-router"
import type { MouseEvent, ReactNode } from "react"
import { StatusText } from "@/components/status/status-badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"
import { modeMeta } from "./guard-meta"
import { rowState } from "./rules/row-state"
import { RuleStatusCell } from "./rules/rule-status-cell"
import { TableFrame } from "@/components/layout/table-frame"

/** Clicks on the row open the rule, except on the links and buttons inside it, which do their own thing. */
const fromControl = (event: MouseEvent) => event.target instanceof Element && event.target.closest("a, button, input") !== null

export function GuardRow({ guard, now }: { readonly guard: Guard; readonly now: number }) {
  const navigate = useNavigate()
  const state = rowState(guard, now)
  // A quick-added rule has no mode until verify reads one from its wording.
  const modeFromWording = guard.modeFollowsRule && guard.compiled === null
  return (
    <TableRow
      className={cn("cursor-pointer", state.kind === "attention" && "bg-warning/5 hover:bg-warning/10")}
      data-attention={state.kind === "attention" ? state.reason : undefined}
      onClick={(event) => {
        if (!fromControl(event)) void navigate({ to: "/guards/$guardId", params: { guardId: guard.id } })
      }}
    >
      <TableCell className={cn("whitespace-normal", state.kind === "attention" && "shadow-[inset_2px_0_0_var(--color-warning)]")}>
        <Link to="/guards/$guardId" params={{ guardId: guard.id }} className="font-semibold break-words underline-offset-4 hover:underline">
          {guard.name}
        </Link>
        {guard.rule !== guard.name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{guard.rule}</p>}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {modeFromWording ? <span className="text-muted-foreground">From its wording</span> : <StatusText tone={modeMeta[guard.mode].tone}>{modeMeta[guard.mode].label}</StatusText>}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatPercent(guard.threshold)}</TableCell>
      <TableCell>
        <RuleStatusCell guard={guard} state={state} />
      </TableCell>
    </TableRow>
  )
}

/** The rules, then `after` (the quick-add rows), in one table. */
export function GuardsTable({ guards, after, now = Date.now() }: { readonly guards: ReadonlyArray<Guard>; readonly after?: ReactNode; readonly now?: number }) {
  return (
    <TableFrame>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[55%] sm:w-[46%]">Rule</TableHead>
            <TableHead className="hidden sm:table-cell">When broken</TableHead>
            <TableHead className="hidden w-24 text-right md:table-cell">Sensitivity</TableHead>
            <TableHead className="w-[45%] sm:w-52">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {guards.map((guard) => <GuardRow key={guard.id} guard={guard} now={now} />)}
          {after}
        </TableBody>
      </Table>
    </TableFrame>
  )
}
