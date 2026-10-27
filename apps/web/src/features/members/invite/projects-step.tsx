import type { Project, ProjectId, Resource } from "@pc/domain"
import { FolderKanban, Info } from "lucide-react"
import { ExpandableNames } from "@/components/form/expandable-names"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { projectsAtom } from "@/features/projects/atoms"
import { allResourcesAtom } from "@/features/resources/atoms"

/** A project's resources worth granting in one go; secrets stay out, they are referenced, not used. */
export const projectResources = (resources: ReadonlyArray<Resource>, project: Project) =>
  resources.filter((resource) => resource.projectId === project.id && resource.config.kind !== "secret")

interface ProjectsStepProps {
  readonly projectIds: ReadonlyArray<ProjectId>
  readonly onToggle: (project: Project, resources: ReadonlyArray<Resource>, on: boolean) => void
}

/**
 * Projects have no member list: a person reaches a project's resources through grants, and a token scoped
 * to a project sees only that project. This step says so, and turns "they work on X" into those grants.
 */
export function ProjectsStep({ projectIds, onToggle }: ProjectsStepProps) {
  const projects = useQueryData(projectsAtom(false), [])
  const resources = useQueryData(allResourcesAtom, [])
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded-lg bg-muted/55 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p>
          Projects have no members. People reach a project&apos;s resources through grants, and a token scoped to a project sees only that
          project. Choose a project to grant its resources in the next step, where you can change each one.
        </p>
      </div>
      {projects.length === 0 ? (
        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <FolderKanban className="size-4" />
          No projects yet, so everything is org-wide. Continue to choose resources.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {projects.map((project) => {
            const own = projectResources(resources, project)
            const added = projectIds.includes(project.id)
            return (
              <li key={project.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-semibold">{project.name}</span>
                  {own.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No resources yet</span>
                  ) : (
                    <ExpandableNames names={own.map((resource) => resource.name)} />
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={added ? "secondary" : "outline"}
                  aria-pressed={added}
                  disabled={own.length === 0}
                  onClick={() => onToggle(project, own, !added)}
                >
                  {added ? "Added, undo" : `Grant its ${own.length === 1 ? "resource" : `${own.length} resources`}`}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
