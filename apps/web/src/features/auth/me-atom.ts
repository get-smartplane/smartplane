import { apiQuery } from "@/lib/api/atoms"

/** The signed-in principal and their org. Every authenticated page hangs off this query. */
export const meAtom = apiQuery(["me"], (api) => api.me.get())
