import { navGroups, type NavItem } from "./nav-items"

const items = navGroups.flatMap((group) => group.items)

/** The nav item a path belongs to (`/guards/grd_…` → Guards), for the header breadcrumb. */
export const currentSection = (pathname: string): NavItem | undefined =>
  pathname === "/"
    ? items.find((item) => item.to === "/")
    : items.find((item) => item.to !== "/" && pathname.startsWith(item.to))
