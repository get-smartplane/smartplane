import type { BundleSkillConfig, Resource, SkillVersion } from "@pc/domain"
import { useState } from "react"
import { QueryView } from "@/components/query/query-view"
import { useCan } from "@/features/auth/me-context"
import { ResourceGrants } from "@/features/resources/resource-grants"
import { versionsAtom } from "../atoms"
import { FilesSection } from "../files/files-section"
import { ScanningDisabled, ScanSection } from "../scanning/scan-section"
import { useScanning } from "../use-scanning"
import { VersionsSection } from "../versions/versions-section"
import { SkillHeader } from "./skill-header"

interface SkillBodyProps {
  readonly resource: Resource
  readonly config: BundleSkillConfig
  readonly versions: ReadonlyArray<SkillVersion>
}

/** One version is "in view" (files, scan); it starts as the active one and follows new fetches and uploads. */
function SkillBody({ resource, config, versions }: SkillBodyProps) {
  const scanning = useScanning()
  const fallback = versions.find((version) => version.active) ?? [...versions].sort((a, b) => b.version - a.version)[0]
  const [chosen, setChosen] = useState<number | undefined>(undefined)
  const shown = versions.find((version) => version.version === chosen) ?? fallback
  return (
    <>
      <SkillHeader resource={resource} config={config} versions={versions} scanning={scanning} onNewVersion={(version) => setChosen(version.version)} />
      {shown && <FilesSection version={shown} />}
      {shown && <VersionsSection versions={versions} scanning={scanning} selected={shown.version} onSelect={setChosen} />}
      {shown && scanning && (scanning.enabled ? <ScanSection version={shown} scanning={scanning} /> : <ScanningDisabled />)}
    </>
  )
}

/** A GitHub, link or uploaded skill: its versions, their files and scans, and who may use it. */
export function SkillDetail({ resource, config }: { readonly resource: Resource; readonly config: BundleSkillConfig }) {
  const canGrant = useCan("grants:manage")
  return (
    <div className="flex flex-col gap-8">
      <QueryView atom={versionsAtom(resource.id)}>{(versions) => <SkillBody resource={resource} config={config} versions={versions} />}</QueryView>
      {canGrant && <ResourceGrants resource={resource} />}
    </div>
  )
}
