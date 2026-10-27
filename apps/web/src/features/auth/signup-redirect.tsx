import { BrandName } from "@/components/brand/brand-mark"
import { SkyField } from "@/components/sky/sky-field"
import { Spinner } from "@/components/ui/spinner"
import { loginUrl } from "@/lib/api/session"

/** Shown for the moment between the marketing site's "Start free" and the WorkOS sign-up screen. */
export function SignupRedirect() {
  return (
    <SkyField plane={{ left: 62, top: 24, width: 12 }} className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-lg bg-card px-6 py-8 text-center text-card-foreground ring-[1.5px] ring-plane-line dark:ring-border">
        <BrandName />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Taking you to sign up…
        </p>
        <a href={loginUrl({ signup: true })} className="text-xs font-semibold text-brand underline-offset-4 hover:underline">
          Continue if nothing happens
        </a>
      </div>
    </SkyField>
  )
}
