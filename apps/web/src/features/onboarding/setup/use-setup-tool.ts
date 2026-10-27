import type { OrgSetup, Resource } from "@pc/domain"
import { useQueryData } from "@/components/query/use-query-data"
import { allResourcesAtom } from "@/features/resources/atoms"

/** The tool connected in the first step, once the resource list has it (undefined before, or if it was removed). */
export const useSetupTool = (setup: OrgSetup): Resource | undefined => {
  const resources = useQueryData(allResourcesAtom, [])
  return setup.toolResourceId === null ? undefined : resources.find((resource) => resource.id === setup.toolResourceId)
}
