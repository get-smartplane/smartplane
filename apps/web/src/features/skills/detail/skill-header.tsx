import type { BundleSkillConfig, Resource, SkillScanning, SkillVersion } from "@pc/domain"
import { BackLink } from "@/components/layout/back-link"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/status/status-badge"
import { kindMeta } from "@/features/resources/kinds"
import { SkillSourceBadge } from "../source/source-badge"
import { activeStatus } from "../versions/active-status"
import { SkillActions } from "./skill-actions"

interface SkillHeaderProps {
  readonly resource: Resource
  readonly config: BundleSkillConfig
  readonly versions: ReadonlyArray<SkillVersion>
  readonly scanning: SkillScanning | undefined
  readonly onNewVersion: (version: SkillVersion) => void
}

/** Name, what it is for, where it comes from, and which version agents get right now. */
export function SkillHeader({ resource, config, versions, scanning, onNewVersion }: SkillHeaderProps) {
  const Icon = kindMeta.skill.icon
  const active = versions.find((version) => version.active)
  const status = activeStatus(versions, scanning)
  return (
    <div className="flex flex-col gap-3">
      <BackLink to="/resources" search={{ kind: "skill" }}>
        Resources
      </BackLink>
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex size-12 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <PageHeader
            title={resource.name}
            status={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
            description={
              <div className="flex flex-col gap-2.5">
                <span>{resource.description || active?.description || kindMeta.skill.description}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <SkillSourceBadge config={config} active={active} />
                  {active && (
                    <span className="font-mono text-xs text-muted-foreground" title={active.contentHash}>
                      {active.name} · {active.contentHash.slice(0, 12)}
                    </span>
                  )}
                </span>
              </div>
            }
            actions={<SkillActions resource={resource} config={config} downloadable={active !== undefined} onNewVersion={onNewVersion} />}
          />
        </div>
      </div>
    </div>
  )
}
