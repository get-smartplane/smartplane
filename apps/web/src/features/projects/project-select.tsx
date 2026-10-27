import type { ProjectId } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { projectsAtom } from "./atoms"

const orgWide = "org"

interface ProjectSelectProps {
  readonly id?: string
  readonly value: ProjectId | null
  readonly onChange: (project: ProjectId | null) => void
  readonly orgWideLabel?: string
}

/** `null` means org-wide. */
export function ProjectSelect({ id, value, onChange, orgWideLabel = "Org-wide" }: ProjectSelectProps) {
  const projects = useQueryData(projectsAtom(false), [])
  const select = (selected: string) => onChange(projects.find((project) => project.id === selected)?.id ?? null)
  return (
    <Select value={value ?? orgWide} onValueChange={select}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={orgWide}>{orgWideLabel}</SelectItem>
        {projects.length > 0 && <SelectSeparator />}
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
