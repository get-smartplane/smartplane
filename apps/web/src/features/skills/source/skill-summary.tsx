import { isInlineSkill, type ResourceId, type SkillConfig } from "@pc/domain"
import { useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { StatusText } from "@/components/status/status-badge"
import { versionsAtom } from "../atoms"
import { useScanning } from "../use-scanning"
import { activeStatus } from "../versions/active-status"
import { SkillSourceBadge } from "./source-badge"

function ActiveVersion({ resourceId }: { readonly resourceId: ResourceId }) {
  const versions = useAtomValue(versionsAtom(resourceId))
  const scanning = useScanning()
  if (!AsyncResult.isSuccess(versions)) return null
  const status = activeStatus(versions.value, scanning)
  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      <StatusText tone={status.tone}>{status.label}</StatusText>
    </span>
  )
}

/** A skill's line in lists: inline skills say what they are for; bundles show their source and what is served. */
export function SkillSummary({ config, resourceId }: { readonly config: SkillConfig; readonly resourceId: ResourceId | undefined }) {
  if (isInlineSkill(config) || resourceId === undefined) return <span className="truncate text-xs text-muted-foreground">{config.description}</span>
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <SkillSourceBadge config={config} />
      <ActiveVersion resourceId={resourceId} />
    </span>
  )
}
