import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { AsyncResult } from "effect/reactivity"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { ErrorState } from "@/components/query/error-state"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { BrandMark } from "@/components/brand/brand-mark"
import { MeContext } from "@/features/auth/me-context"
import { meAtom } from "@/features/auth/me-atom"
import { errorOf } from "@/lib/api/outcome"
import { AppShell } from "./app-shell"

/**
 * Resolves the principal before rendering the shell; Unauthorized redirects to login or onboarding.
 * Full-page flows (setup, welcome) pass their own frame as `children` instead of the sidebar shell.
 */
export function AppGate({ children }: { readonly children?: ReactNode }) {
  const me = useAtomValue(meAtom)
  const refresh = useAtomRefresh(meAtom)

  if (AsyncResult.isSuccess(me)) {
    return (
      <MeContext.Provider value={me.value}>
        {children ?? <AppShell />}
      </MeContext.Provider>
    )
  }
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      {AsyncResult.isFailure(me) ? (
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <ErrorState error={errorOf(me.cause)} onRetry={refresh} />
          <Button variant="link" asChild>
            <Link to="/login">Go to sign in</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-muted-foreground" aria-busy="true">
          <BrandMark className="size-10 text-foreground" />
          <Spinner className="size-5" />
        </div>
      )}
    </div>
  )
}
