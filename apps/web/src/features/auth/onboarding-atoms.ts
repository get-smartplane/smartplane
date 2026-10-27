import type { CreateOrg } from "@pc/domain"
import { apiMutation } from "@/lib/api/atoms"

export const createOrgAtom = apiMutation(["me"], (api, payload: CreateOrg) => api.onboarding.createOrg({ payload }))
