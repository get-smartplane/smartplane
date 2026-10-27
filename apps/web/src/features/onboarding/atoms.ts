import type { UpdateMemberWelcome, UpdateOrgSetup } from "@pc/domain"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

/** The org's setup (null without `resources:manage`) and the caller's own welcome. */
export const progressAtom = apiQuery(["onboarding"], (api) => api.onboardingProgress.get())

export const updateSetupAtom = apiMutation(["onboarding"], (api, payload: UpdateOrgSetup) => api.onboardingProgress.updateSetup({ payload }))

export const updateWelcomeAtom = apiMutation(["onboarding"], (api, payload: UpdateMemberWelcome) => api.onboardingProgress.updateWelcome({ payload }))
