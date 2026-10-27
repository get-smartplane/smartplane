import type { Guard, GuardStatus } from "@pc/domain"
import { useState } from "react"
import { SegmentedFilter } from "@/components/layout/segmented-filter"
import { GuardsTable } from "./guards-table"
import { QuickAddRow } from "./quick-add/quick-add-row"
import { QuickRuleRow } from "./quick-add/quick-rule-row"
import { useQuickAdd } from "./quick-add/use-quick-add"
import { RulesPoller } from "./rules/rules-poller"
import { useNow } from "./verify/use-now"
import { pollingFor } from "./verify/verify-state"

type RuleView = GuardStatus | "all"

/**
 * The rules with their state as a one-click filter; drafts are easy to find and finish. Rules added from the
 * row at the bottom stay together just above it, in the order typed, whatever the filter, so their parallel
 * verify runs can be watched side by side.
 */
export function RulesList({ guards }: { readonly guards: ReadonlyArray<Guard> }) {
  const [view, setView] = useState<RuleView>("all")
  const quick = useQuickAdd()
  const now = useNow(guards.some((guard) => pollingFor(guard, Date.now()) === "poll"))
  const count = (status: GuardStatus) => guards.filter((guard) => guard.status === status).length
  const segments = [
    { value: "all", label: "All", count: guards.length },
    { value: "active", label: "Active", count: count("active") },
    { value: "draft", label: "Drafts", count: count("draft") },
    { value: "disabled", label: "Switched off", count: count("disabled") }
  ] as const
  const quickIds = new Set(quick.rules.flatMap((rule) => (rule.state === "added" ? [rule.id] : [])))
  const shown = (view === "all" ? guards : guards.filter((guard) => guard.status === view)).filter((guard) => !quickIds.has(guard.id))
  const after = (
    <>
      {quick.rules.map((rule) => (
        <QuickRuleRow
          key={rule.key}
          rule={rule}
          guard={rule.state === "added" ? guards.find((guard) => guard.id === rule.id) : undefined}
          now={now}
          onRetry={() => quick.retry(rule.key)}
          onDismiss={() => quick.dismiss(rule.key)}
        />
      ))}
      <QuickAddRow onAdd={quick.add} />
    </>
  )
  return (
    <div className="flex flex-col gap-3">
      <RulesPoller guards={guards} />
      {guards.length > 0 && <SegmentedFilter label="Show rules" segments={segments} value={view} onChange={setView} />}
      <GuardsTable guards={shown} after={after} now={now} />
      {shown.length === 0 && quick.rules.length === 0 && guards.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">No rules in this state.</p>
      )}
    </div>
  )
}
