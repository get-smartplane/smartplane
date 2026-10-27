import { useAtomValue } from "@effect/atom-react"
import { Navigate } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { ArrowRight, CircleAlert, UserX } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { loginUrl } from "@/lib/api/session"
import { AuthLayout } from "./auth-layout"
import { LoginAside } from "./login-aside"
import type { LoginSearch } from "./login-search"
import { meAtom } from "./me-atom"

export function LoginPage({ search }: { readonly search: LoginSearch }) {
  const me = useAtomValue(meAtom)
  // Already signed in: skip the landing. Any failure (including an offline API) just shows it.
  if (AsyncResult.isSuccess(me)) return <Navigate to="/" replace />

  return (
    <AuthLayout aside={<LoginAside />}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-[2rem] leading-9">Sign in</h1>
          <p className="text-[0.9375rem] text-pretty text-muted-foreground">
            Decide what your agents can reach, set the rules they follow, and keep every call on the record.
          </p>
        </div>
        {search.reason === "deprovisioned" && (
          <Alert variant="destructive">
            <UserX />
            <AlertTitle>Access removed</AlertTitle>
            <AlertDescription>Your membership was deprovisioned. Ask an org admin if this is a mistake.</AlertDescription>
          </Alert>
        )}
        {search.error !== undefined && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Sign-in didn't finish</AlertTitle>
            <AlertDescription>We couldn't complete sign-in with your identity provider. Try again; if it keeps failing, contact support.</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-3">
          <Button size="lg" asChild>
            <a href={loginUrl()}>
              Continue with SSO or email
              <ArrowRight data-icon="inline-end" />
            </a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href={loginUrl({ signup: true })}>New here? Create an account</a>
          </Button>
        </div>
        <p className="text-[0.8125rem] text-muted-foreground">Your organization may require single sign-on.</p>
      </div>
    </AuthLayout>
  )
}
