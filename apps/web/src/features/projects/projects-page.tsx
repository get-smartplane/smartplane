import { FolderKanban } from "lucide-react"
import { useState } from "react"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { SegmentedFilter } from "@/components/layout/segmented-filter"
import { QueryView } from "@/components/query/query-view"
import { useCan } from "@/features/auth/me-context"
import { projectsAtom } from "./atoms"
import { CreateProjectDialog } from "./create-project-dialog"
import { ProjectsTable } from "./projects-table"

type ProjectView = "active" | "all"

const segments = [
  { value: "active", label: "Active" },
  { value: "all", label: "Include archived" }
] as const

export function ProjectsPage() {
  const canManage = useCan("projects:manage")
  const [view, setView] = useState<ProjectView>("active")
  return (
    <Page>
      <PageHeader
        title="Projects"
        description="Keep one effort's resources, rules and tokens apart from everything else."
        actions={canManage && <CreateProjectDialog />}
      />
      <SegmentedFilter label="Show projects" segments={segments} value={view} onChange={setView} />
      <QueryView atom={projectsAtom(view === "all")}>
        {(projects) =>
          projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="A project-scoped token only sees that project's resources and rules. Everything else stays org-wide."
              action={canManage && <CreateProjectDialog />}
            />
          ) : (
            <ProjectsTable projects={projects} />
          )
        }
      </QueryView>
    </Page>
  )
}
