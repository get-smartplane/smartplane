import type { ReactNode } from "react"
import { BrandName } from "@/components/brand/brand-mark"
import { SkyField } from "@/components/sky/sky-field"

interface AuthLayoutProps {
  readonly children: ReactNode
  /** The sky side on wide screens: what the product does, shown rather than listed. */
  readonly aside: ReactNode
}

const asideClouds = [
  { seed: 21, left: 6, top: 6, width: 22 },
  { seed: 3, left: 64, top: 3, width: 30 },
  { seed: 7, left: -6, top: 78, width: 34 },
  { seed: 12, left: 70, top: 82, width: 26 },
  { seed: 5, left: 82, top: 44, width: 16 }
] as const

const stripClouds = [
  { seed: 21, left: 8, top: 30, width: 30 },
  { seed: 3, left: 62, top: 10, width: 40 }
] as const

export function AuthLayout({ children, aside }: AuthLayoutProps) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col">
        <SkyField clouds={stripClouds} className="h-20 lg:hidden" />
        <div className="flex flex-1 flex-col px-6 py-6 sm:px-10 sm:py-8">
          <BrandName />
          <main className="flex flex-1 items-center py-12">
            <div className="mx-auto w-full max-w-sm">{children}</div>
          </main>
          <p className="text-xs text-muted-foreground">Built for SOC 2 · Sign-in by WorkOS AuthKit</p>
        </div>
      </div>
      <SkyField clouds={asideClouds} plane={{ left: 68, top: 20, width: 14 }} className="hidden lg:flex lg:flex-col lg:justify-center lg:px-14 xl:px-20">
        {aside}
      </SkyField>
    </div>
  )
}
