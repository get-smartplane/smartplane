import { type Guard, type GuardTestedCall, scoreSelfTest, selfTestSummary, verifyActive } from "@pc/domain"
import { TriangleAlert } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useMutation } from "@/lib/api/use-mutation"
import { AddTestCallFormView } from "./add-test-call-form"
import { Spinner } from "@/components/ui/spinner"
import { removeTestCallAtom } from "./atoms"
import { pollingFor } from "./verify/verify-state"
import { TestedCallRow } from "./tested-call-row"

const sameCall = (a: GuardTestedCall, b: Guard["testCalls"][number]) => a.tool === b.tool && JSON.stringify(a.arguments) === JSON.stringify(b.arguments)

/** Mistakes first, then the calls that break the rule, then the allowed ones. */
const order = (call: GuardTestedCall) => (call.triggered !== call.violates ? 0 : call.violates ? 1 : 2)

/**
 * The calls verify ran through the real classifier: generated from the tools of the systems the rule
 * names, the draft's own examples, and calls people added. Shows expected against actual for each.
 */
export function TestedCallsCard({ guard }: { readonly guard: Guard }) {
  const remove = useMutation(removeTestCallAtom, { success: "Call removed from the test set" })
  const run = guard.verify
  // A run that has not tested this draft yet: older results (another version) would mislead.
  const testing = run !== null && verifyActive(run) && guard.compiled?.selfTest?.jobId !== run.runId
  const selfTest = testing ? undefined : guard.compiled?.selfTest
  const polling = pollingFor(guard, Date.now())
  const calls = [...(selfTest?.calls ?? [])].sort((a, b) => order(a) - order(b))
  const score = scoreSelfTest(calls)
  const untested = guard.testCalls.filter((custom) => !calls.some((call) => call.source === "custom" && sameCall(call, custom)))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tested calls</CardTitle>
        <CardDescription>
          {testing
            ? (
              <span className="flex items-start gap-2" role="status">
                <Spinner className="mt-0.5" />
                <span>{run?.stage === "needs_confirmation" ? "Testing starts once you confirm what the rule names." : "Calls show here once the draft has been tested on example calls with the classifier that checks live calls."}</span>
              </span>
            )
            : selfTest === undefined
            ? run?.stage === "failed"
              ? (
                <span className="flex items-start gap-2 text-warning-ink">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>{run.error ?? "Verify did not finish. Verify again."}</span>
                </span>
              )
              : guard.compiled
              ? "This version was verified before calls were tested. Verify again to test it on real tool calls."
              : "Verifying tests the rule on example calls to the tools it names, with the classifier that checks live calls."
            : selfTest.status === "running"
            ? polling === "stale"
              ? "The test is taking much longer than usual. Verify again to restart it."
              : (
                <span className="flex items-start gap-2" role="status">
                  <Spinner className="mt-0.5" />
                  <span>{verifyActive(run) ? "Improving: recompiling once with the calls the first draft misjudged. These are the first draft's results." : "Testing this draft on example calls with the classifier that checks live calls. This page updates when it is done."}</span>
                </span>
              )
            : selfTest.status === "failed"
            ? (
              <span className="flex items-start gap-2 text-warning-ink">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>{selfTest.note ?? "The test could not finish. Verify again to test this draft."}</span>
              </span>
            )
            : (
              <>
                <span className={score.mistakes.length === 0 ? "font-medium text-success-ink" : "font-medium text-warning-ink"}>{selfTestSummary(selfTest)}</span>
                {selfTest.recompiled ? <span> · recompiled once to fix the first draft's mistakes</span> : selfTest.retried && <span> · a recompile did not do better, so this version stays</span>}
                <span>. Nothing is activated until you do it.</span>
                {selfTest.note && <span className="mt-1 block">{selfTest.note}</span>}
              </>
            )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {calls.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border" aria-label="Tested calls">
            {calls.map((call, index) => {
              const custom = call.source === "custom" ? guard.testCalls.find((candidate) => sameCall(call, candidate)) : undefined
              return (
                <TestedCallRow
                  key={`${call.tool}-${index}`}
                  call={call}
                  removing={remove.pending}
                  {...(custom === undefined ? {} : { onRemove: () => void remove.execute({ id: guard.id, callId: custom.id }) })}
                />
              )
            })}
          </ul>
        )}
        {untested.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {untested.length} added {untested.length === 1 ? "call runs" : "calls run"} on the next verify.
          </p>
        )}
        <AddTestCallFormView guard={guard} />
      </CardContent>
    </Card>
  )
}
