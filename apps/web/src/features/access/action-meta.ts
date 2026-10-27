import type { Action } from "@pc/domain"

/** Actions are ordered: each implies the ones before it (`actionImplies`). */
export const actionMeta: { readonly [A in Action]: { readonly label: string; readonly description: string } } = {
  read: { label: "Read", description: "See the resource and its metadata." },
  use: { label: "Use", description: "Call its tools or query it." },
  write: { label: "Write", description: "Use it, including modifying calls." },
  admin: { label: "Admin", description: "Everything, including changing its configuration." }
}
