import type { Project, Resource, TeamId } from "@pc/domain"
import { useCallback, useRef, useState } from "react"
import type { ValueTypeOf } from "@/features/access/argument-limits/argument-limits"
import type { GrantDraft } from "@/features/access/grant-draft"
import { valueTypeOf } from "@/features/access/tool-source"
import { emptySetup, grantItem, type InviteSetup, nextKey, toInviteAccess } from "./invite-setup"

const untyped = valueTypeOf(undefined)

/** The teams, projects and direct grants being set up, and the edits each step makes to them. */
export const useInviteSetup = (initial: InviteSetup = emptySetup) => {
  const [setup, setSetup] = useState(initial)
  // Argument values are typed by each resource's schema, which only its row loads; rows report it here.
  const valueTypes = useRef(new Map<number, ValueTypeOf>())
  const register = useCallback((key: number, typeOf: ValueTypeOf) => void valueTypes.current.set(key, typeOf), [])

  const setTeamIds = (teamIds: ReadonlyArray<TeamId>) => setSetup((current) => ({ ...current, teamIds }))

  const addGrant = (resourceId: string) =>
    setSetup((current) => ({ ...current, grants: [...current.grants, grantItem(nextKey(current), resourceId)] }))

  const updateGrant = (key: number, change: (draft: GrantDraft) => GrantDraft) =>
    setSetup((current) => ({ ...current, grants: current.grants.map((item) => (item.key === key ? { ...item, draft: change(item.draft) } : item)) }))

  const removeGrant = (key: number) => setSetup((current) => ({ ...current, grants: current.grants.filter((item) => item.key !== key) }))

  /** Adds a grant for each of the project's resources not granted yet; undoing removes the untouched ones it added. */
  const toggleProject = (project: Project, resources: ReadonlyArray<Resource>, on: boolean) =>
    setSetup((current) => {
      const ids = resources.map((resource) => resource.id)
      if (!on) {
        return {
          ...current,
          projectIds: current.projectIds.filter((id) => id !== project.id),
          grants: current.grants.filter((item) => !ids.some((id) => id === item.draft.resourceId) || item.draft.action !== "use" || item.draft.restrictTools || item.draft.expiry !== "")
        }
      }
      const missing = ids.filter((id) => !current.grants.some((item) => item.draft.resourceId === id))
      const start = nextKey(current)
      return { ...current, projectIds: [...current.projectIds, project.id], grants: [...current.grants, ...missing.map((id, index) => grantItem(start + index, id))] }
    })

  const toAccess = () => toInviteAccess(setup, (key) => valueTypes.current.get(key) ?? untyped)

  return { setup, reset: () => setSetup(initial), setTeamIds, addGrant, updateGrant, removeGrant, toggleProject, register, toAccess }
}

export type InviteSetupState = ReturnType<typeof useInviteSetup>
