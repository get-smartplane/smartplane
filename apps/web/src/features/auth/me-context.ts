import { hasPermission, type Me, type OrgPermission } from "@pc/domain"
import { createContext, useContext } from "react"

export const MeContext = createContext<Me | null>(null)

export const useMe = (): Me => {
  const me = useContext(MeContext)
  if (me === null) throw new Error("useMe must be used inside the authenticated app shell")
  return me
}

/** UI hint only: the API enforces every permission again. */
export const useCan = (permission: OrgPermission): boolean => hasPermission(useMe().principal, permission)
