import { CircleAlert } from "lucide-react"
import type { ReactNode } from "react"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { OAuthFailure } from "./oauth-return"

/** Why connecting failed and what to do, with the retry right beside it. */
interface OAuthFailureAlertProps {
  readonly failure: OAuthFailure
  readonly action?: ReactNode
  /** Off for states that only wait on someone (not connected yet), rather than something that broke. */
  readonly destructive?: boolean
}

export function OAuthFailureAlert({ failure, action, destructive = true }: OAuthFailureAlertProps) {
  return (
    <Alert variant={destructive ? "destructive" : "default"} className="animate-reveal">
      <CircleAlert />
      <AlertTitle>{failure.title}</AlertTitle>
      <AlertDescription>{failure.description}</AlertDescription>
      {action && <AlertAction>{action}</AlertAction>}
    </Alert>
  )
}
