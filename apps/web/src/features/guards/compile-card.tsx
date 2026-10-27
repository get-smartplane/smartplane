import { type Guard, verifyActive } from "@pc/domain"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { compileGuardAtom } from "./atoms"
import { AppliesCard } from "./applies/applies-card"
import { CompiledReview } from "./compiled-review"
import { EditRuleDialog } from "./edit-rule-dialog"
import { GroundingSummary } from "./grounding-summary"
import { SuggestionCallout } from "./suggestion-callout"
import { VerifyPanel } from "./verify/verify-panel"

/** A finished run stays on screen a little while, so its outcome is seen; failures and cancels stay until the next run. */
const RecentMs = 5 * 60 * 1000
const showRun = (guard: Guard, now: number) =>
  guard.verify !== null && (guard.verify.stage !== "done" || now - guard.verify.updatedAt.epochMilliseconds < RecentMs)

export function CompileCard({ guard }: { readonly guard: Guard }) {
  // The run shows its own progress below; no toast.
  const compile = useMutation(compileGuardAtom, { quiet: true })
  const running = verifyActive(guard.verify)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">The rule</CardTitle>
        <CardDescription className="font-display text-xl leading-snug text-pretty text-foreground">
          “{guard.rule}”
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <EditRuleDialog guard={guard} />
          <Button variant={guard.compiled ? "outline" : "default"} disabled={compile.pending || running} onClick={() => void compile.execute(guard.id)}>
            {compile.pending || running ? <Spinner /> : <Sparkles />}
            {guard.compiled ? "Verify again" : "Verify"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 border-t pt-4">
        {guard.verify !== null && showRun(guard, Date.now()) && <VerifyPanel guard={guard} run={guard.verify} />}
        {guard.compiled ? (
          <div className="flex flex-col gap-4">
            {guard.compiled.grounding && <GroundingSummary guard={guard} grounding={guard.compiled.grounding} />}
            <AppliesCard guard={guard} />
            {guard.compiled.suggestion && <SuggestionCallout guard={guard} suggestion={guard.compiled.suggestion} />}
            <CompiledReview compiled={guard.compiled} version={guard.compiledVersion} />
          </div>
        ) : running ? null : (
          <p className="text-sm text-muted-foreground">
            Verifying finds the systems the rule names, turns the sentence into instructions for the classifier that
            checks each call, and tests them on example calls to those systems' real tools. You read the result before
            the rule goes live; verifying again returns it to draft.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
