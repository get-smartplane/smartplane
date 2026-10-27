import type { KeyRewrapResult } from "@pc/domain"
import { KeySquare } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { rewrapKeysAtom } from "./atoms"
import { RewrapSummary } from "./rewrap-summary"

/** Re-wraps secret data keys under the current key-encryption key, one bounded batch per click. */
export function RotateKeysCard() {
  const rewrap = useMutation(rewrapKeysAtom)
  const [result, setResult] = useState<KeyRewrapResult>()

  const run = async () => {
    const outcome = await rewrap.execute()
    if (outcome._tag === "Success") setResult(outcome.value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeySquare className="size-4 text-muted-foreground" />
          Encryption keys
        </CardTitle>
        <CardDescription className="max-w-xl">
          Each secret is encrypted with its own data key, wrapped by a key-encryption key. After the platform key is
          rotated, re-wrap the data keys so nothing depends on the old one. Secret values are never decrypted or shown.
        </CardDescription>
        <CardAction>
          <Button variant={result && result.remaining > 0 ? "default" : "outline"} disabled={rewrap.pending} onClick={() => void run()}>
            {rewrap.pending && <Spinner />}
            {result && result.remaining > 0 ? "Continue rotating" : "Rotate encryption keys"}
          </Button>
        </CardAction>
      </CardHeader>
      {result && (
        <CardContent>
          <RewrapSummary result={result} />
        </CardContent>
      )}
    </Card>
  )
}
