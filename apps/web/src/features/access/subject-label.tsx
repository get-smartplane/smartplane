import type { GrantSubject } from "@pc/domain"
import { Bot, Shield, User, UsersRound } from "lucide-react"
import { useEntityLabel } from "@/lib/lookup/use-entity-label"
import { subjectRef } from "@/lib/lookup/refs"
import { cn } from "@/lib/utils"

const icons = { user: User, team: UsersRound, role: Shield, service_account: Bot } as const
export const subjectTypeLabels = { user: "Member", team: "Team", role: "Role", service_account: "Service account" } as const

interface SubjectLabelProps {
  readonly subject: GrantSubject
  /** The viewer themself: named "You". */
  readonly self?: boolean
  /** Replaces the subject type under the name, e.g. why the grant exists. */
  readonly note?: string
}

/** A grant subject by its current name (an id until it resolves); a removed subject is dimmed. */
export function SubjectLabel({ subject, self = false, note }: SubjectLabelProps) {
  const Icon = icons[subject.type]
  const entity = useEntityLabel(subjectRef(subject))
  const { gone, resolved } = entity
  const label = self ? "You" : entity.label
  return (
    <span className="inline-flex min-w-0 items-center gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn("truncate font-medium", !resolved && !self && "font-mono text-xs", gone && "text-muted-foreground")}>{label}</span>
        <span className="text-xs text-muted-foreground">
          {note ?? subjectTypeLabels[subject.type]}
          {gone && " · removed"}
        </span>
      </span>
    </span>
  )
}
