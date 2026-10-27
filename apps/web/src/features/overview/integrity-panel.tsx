import { useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { ShieldAlert, ShieldCheck, ShieldQuestion, type LucideIcon } from "lucide-react"
import { Panel } from "@/components/layout/panel"
import { Skeleton } from "@/components/ui/skeleton"
import { chainVerificationAtom } from "@/features/audit/atoms"
import { useMe } from "@/features/auth/me-context"
import { cn } from "@/lib/utils"

interface Verdict {
  readonly icon: LucideIcon
  readonly title: string
  readonly detail: string
  readonly tone: string
}

const useVerdict = (): Verdict | undefined => {
  const result = useAtomValue(chainVerificationAtom)
  if (AsyncResult.isInitial(result)) return undefined
  if (AsyncResult.isFailure(result))
    return { icon: ShieldQuestion, title: "Not verified", detail: "The chain could not be checked just now.", tone: "bg-warning/20 text-warning-ink" }
  const v = result.value
  return v._tag === "Intact"
    ? { icon: ShieldCheck, title: "Chain intact", detail: `${v.checked.toLocaleString()} events re-hashed from #${v.fromSeq}`, tone: "bg-success/10 text-success-ink" }
    : { icon: ShieldAlert, title: "Chain broken", detail: `Event #${v.at} does not match its hash`, tone: "bg-destructive/10 text-danger-ink" }
}

/** The audit log's own health: whether the hash chain verifies, and how long evidence is kept. */
export function IntegrityPanel() {
  const { org } = useMe()
  const verdict = useVerdict()
  return (
    <Panel
      title="Audit record"
      action={
        <Link to="/audit" className="text-xs font-semibold text-brand underline-offset-4 hover:underline">
          Export evidence
        </Link>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {verdict === undefined ? (
          <Skeleton className="h-11 w-full" />
        ) : (
          <div className="flex items-center gap-3">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", verdict.tone)}>
              <verdict.icon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-[0.9375rem] font-semibold">{verdict.title}</span>
              <span className="truncate text-xs text-muted-foreground">{verdict.detail}</span>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Append-only, hash-chained, queryable for <span className="font-semibold text-foreground tabular-nums">{org.auditRetentionDays} days</span>.
        </p>
      </div>
    </Panel>
  )
}
