import type { ProjectId, ResourceId } from "@pc/domain"
import { FormField } from "@/components/form/form-field"
import { Input } from "@/components/ui/input"
import { ProjectSelect } from "@/features/projects/project-select"
import { ResourceScopeField } from "./resource-scope-field"
import { ThresholdSlider } from "./threshold-slider"

interface GuardAdvancedFieldsProps {
  readonly name: string
  readonly onName: (name: string) => void
  readonly nameError: string | undefined
  readonly threshold: number
  readonly onThreshold: (value: number) => void
  readonly projectId: ProjectId | null
  readonly onProject: (project: ProjectId | null) => void
  readonly resourceIds: ReadonlyArray<ResourceId>
  readonly onResources: (ids: ReadonlyArray<ResourceId>) => void
}

/** Name, sensitivity and reach: each has a default that fits most rules. */
export function GuardAdvancedFields(props: GuardAdvancedFieldsProps) {
  return (
    <>
      <FormField id="guard-name" label="Name" error={props.nameError} description="Taken from the rule unless you change it.">
        <Input id="guard-name" value={props.name} onChange={(e) => props.onName(e.target.value)} />
      </FormField>
      <FormField id="guard-threshold" label="Sensitivity" description="Trigger when the classifier is at least this sure the call breaks the rule.">
        <ThresholdSlider id="guard-threshold" value={props.threshold} onChange={props.onThreshold} />
      </FormField>
      <FormField id="guard-project" label="Scope">
        <ProjectSelect id="guard-project" value={props.projectId} onChange={props.onProject} orgWideLabel="Whole organization" />
      </FormField>
      <FormField id="guard-resources" label="Applies to" description="Leave all unchecked to cover every resource in scope.">
        <ResourceScopeField value={props.resourceIds} onChange={props.onResources} />
      </FormField>
    </>
  )
}
