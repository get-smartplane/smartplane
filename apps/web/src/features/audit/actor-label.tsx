import type { Actor } from "@pc/domain"
import { Bot, Cog, Server, User } from "lucide-react"
import { EntityName } from "@/components/status/entity-name"
import { actorRef, machineTokenIdOf } from "@/lib/lookup/refs"

const icons = { user: User, service_account: Bot, system: Cog } as const

/** The actor's current name; a machine token reads "Machine token billing-api", other system actors by subsystem. */
export function ActorName({ actor }: { readonly actor: Actor }) {
  const ref = actorRef(actor)
  if (ref === null) return <span className="truncate">{actor.id}</span>
  if (machineTokenIdOf(actor) === undefined) return <EntityName entity={ref} />
  return (
    <span className="inline-flex max-w-full min-w-0 items-baseline gap-1 overflow-hidden" title={`Machine token ${ref.id}`}>
      <span className="shrink-0">Machine token</span>
      <EntityName entity={ref} className="font-medium" />
    </span>
  )
}

/** Who acted: a member or service account by current name; a system actor by its subsystem (`scim`, `cron`). */
export function ActorLabel({ actor }: { readonly actor: Actor }) {
  const Icon = machineTokenIdOf(actor) === undefined ? icons[actor.type] : Server
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <ActorName actor={actor} />
    </span>
  )
}
