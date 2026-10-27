import type { CreateProject, ProjectId, UpdateProject } from "@pc/domain"
import { Atom } from "effect/reactivity"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const projectsAtom = Atom.family((includeArchived: boolean) =>
  apiQuery(["projects"], (api) => api.projects.list({ query: { includeArchived } }))
)

export const createProjectAtom = apiMutation(["projects"], (api, payload: CreateProject) =>
  api.projects.create({ payload })
)

export const updateProjectAtom = apiMutation(
  ["projects"],
  (api, { id, payload }: { readonly id: ProjectId; readonly payload: UpdateProject }) =>
    api.projects.update({ params: { id }, payload })
)
