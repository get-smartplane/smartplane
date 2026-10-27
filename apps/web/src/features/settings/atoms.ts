import type { AdminPortalIntent, UpdateOrg } from "@pc/domain"
import { Effect } from "effect"
import { apiMutation, apiQuery } from "@/lib/api/atoms"

export const orgAtom = apiQuery(["org"], (api) => api.org.get())

/** `me` carries the org too (the sidebar shows its name); every change is audited. */
export const updateOrgAtom = apiMutation(["org", "me", "audit"], (api, payload: UpdateOrg) => api.org.update({ payload }))

/**
 * The Admin Portal link is a bearer credential for the org's IT settings: it is handed straight to the tab
 * opened for it and never returned, so it stays out of atom state, React state and logs.
 */
export const openAdminPortalAtom = apiMutation(
  ["audit"],
  (api, { intent, tab }: { readonly intent: AdminPortalIntent; readonly tab: Window }) =>
    api.org.adminPortalLink({ payload: { intent } }).pipe(
      Effect.flatMap((link) => Effect.sync(() => tab.location.replace(link.url))),
      Effect.asVoid
    )
)

export const rewrapKeysAtom = apiMutation(["audit"], (api, _: void) => api.secrets.rewrap())
