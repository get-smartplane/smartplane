import type { BundleSkillConfig, Resource, SkillVersion } from "@pc/domain"
import { FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CreateGrantDialog } from "@/features/access/create-grant-dialog"
import { useCan } from "@/features/auth/me-context"
import { RefetchButton } from "./refetch-button"
import { UpdateCheck } from "./update-check"
import { UploadVersionDialog } from "./upload-version-dialog"

interface SkillActionsProps {
  readonly resource: Resource
  readonly config: BundleSkillConfig
  /** Whether there is an active version to download. */
  readonly downloadable: boolean
  readonly onNewVersion: (version: SkillVersion) => void
}

/** How a new version arrives depends on the source; downloading gets the active one as the CLI does. */
export function SkillActions({ resource, config, downloadable, onNewVersion }: SkillActionsProps) {
  const canManage = useCan("resources:manage")
  const canGrant = useCan("grants:manage")
  return (
    <>
      {canManage && config.source === "github" && <UpdateCheck resourceId={resource.id} onFetched={onNewVersion} />}
      {canManage && config.source === "link" && <RefetchButton resourceId={resource.id} onFetched={onNewVersion} />}
      {canManage && config.source === "upload" && <UploadVersionDialog resourceId={resource.id} onUploaded={onNewVersion} />}
      {downloadable && (
        <Button variant="outline" asChild>
          <a href={`/api/skills/${resource.id}/bundle`} download={`${resource.name}.tar.gz`}>
            <FileDown />
            Download
          </a>
        </Button>
      )}
      {canGrant && <CreateGrantDialog resourceId={resource.id} />}
    </>
  )
}
