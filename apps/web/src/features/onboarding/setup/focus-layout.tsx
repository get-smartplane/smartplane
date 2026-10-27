import type { ReactNode } from "react"
import { BrandName } from "@/components/brand/brand-mark"
import { SkyBackdrop } from "../sky/sky-backdrop"

interface FocusLayoutProps {
  /** The way out, top right: "Finish later" or "Go to the dashboard". */
  readonly exit: ReactNode
  /** Over the sky, above the paper: the flight route of the steps. */
  readonly top?: ReactNode
  readonly children: ReactNode
  /** The welcome is shorter: fewer clouds. */
  readonly sparse?: boolean
}

/**
 * A full page without the sidebar: the landing's sky behind, the brand and a way out on top, then one
 * sheet of paper holding the step, so forms read on a calm, solid surface.
 */
export function FocusLayout({ exit, top, children, sparse }: FocusLayoutProps) {
  return (
    <div className="relative isolate flex min-h-svh flex-col overflow-x-clip">
      <SkyBackdrop sparse={sparse} />
      <header className="mx-auto flex h-16 w-full max-w-3xl shrink-0 items-center justify-between gap-4 px-4 text-sky-ink sm:px-8">
        <BrandName />
        {exit}
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-4 pb-20 sm:px-8">
        {top}
        <div className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(15_33_64/0.06),0_8px_24px_-12px_rgb(15_33_64/0.18)] sm:p-8 dark:shadow-none">{children}</div>
      </main>
    </div>
  )
}
