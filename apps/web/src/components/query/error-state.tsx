import { CircleAlert, RotateCw } from "lucide-react"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { UnauthorizedRedirect } from "@/features/auth/unauthorized-redirect"
import { describeError } from "@/lib/api/describe-error"
import type { ApiError } from "@/lib/api/errors"
import { signInRequired } from "@/lib/api/sign-in-required"

interface ErrorStateProps {
  readonly error: ApiError
  readonly onRetry?: () => void
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  if (signInRequired(error)) return <UnauthorizedRedirect reason={error.reason} />
  const { title, description } = describeError(error)
  return (
    <Alert variant={error._tag === "TransportFailure" ? "default" : "destructive"}>
      <CircleAlert />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {onRetry && (
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCw />
            Retry
          </Button>
        </AlertAction>
      )}
    </Alert>
  )
}
