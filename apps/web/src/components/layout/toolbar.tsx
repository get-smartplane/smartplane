import type { ReactNode } from "react"

/** The row between a page's header and its list: filters left, view options right. */
export function Toolbar({ children, end }: { readonly children: ReactNode; readonly end?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">{children}</div>
      {end && <div className="flex shrink-0 items-center gap-2">{end}</div>}
    </div>
  )
}
