import { useAtomValue } from "@effect/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { useEffect } from "react"
import { progressAtom } from "./atoms"

/** Sends an invited member to their welcome on first sign-in; once finished or skipped it never returns. */
export function WelcomeRedirect() {
  const progress = useAtomValue(progressAtom)
  const navigate = useNavigate()
  const pending = AsyncResult.isSuccess(progress) && progress.value.welcome.status === "pending"
  useEffect(() => {
    if (pending) void navigate({ to: "/welcome", replace: true })
  }, [pending, navigate])
  return null
}
