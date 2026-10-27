import type { ReactNode } from "react"

interface PageHeaderProps {
  readonly title: string
  /** One line saying what the page is for, in the user's terms. */
  readonly description?: ReactNode
  /** The page's one primary action, top right. */
  readonly actions?: ReactNode
  /** Status shown beside the title (a rule's state, the chain's integrity). */
  readonly status?: ReactNode
  /** A way back to the list, above the title on detail pages. */
  readonly back?: ReactNode
}

export function PageHeader({ title, description, actions, status, back }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      {back}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-display text-[1.625rem] leading-8 text-balance">{title}</h1>
            {status}
          </div>
          {description && <div className="max-w-2xl text-[0.9375rem] text-pretty text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">{actions}</div>}
      </div>
    </header>
  )
}
