import { apiQuery } from "@/lib/api/atoms"

/** Each secret's current version and when it was written; refreshes with resources (create, rotate, remove). */
export const secretStatusesAtom = apiQuery(["resources"], (api) => api.secrets.list())
