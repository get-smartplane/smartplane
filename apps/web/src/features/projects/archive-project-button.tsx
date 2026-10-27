import type { Project } from "@pc/domain"
import { Archive, ArchiveRestore } from "lucide-react"
import { RowAction } from "@/components/form/row-action"
import { useMutation } from "@/lib/api/use-mutation"
import { updateProjectAtom } from "./atoms"

/** Archiving is reversible from the same button, so it runs without a confirmation. */
export function ArchiveProjectButton({ project }: { readonly project: Project }) {
  const archived = project.archivedAt !== null
  const update = useMutation(updateProjectAtom, { success: archived ? "Project restored" : "Project archived" })
  return (
    <RowAction
      label={archived ? "Restore project" : "Archive project"}
      disabled={update.pending}
      onClick={() => void update.execute({ id: project.id, payload: { archived: !archived } })}
    >
      {archived ? <ArchiveRestore /> : <Archive />}
    </RowAction>
  )
}
