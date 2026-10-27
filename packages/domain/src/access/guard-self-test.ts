import type { GuardSelfTest, GuardTestedCall } from "./guard-grounding"

export interface SelfTestScore {
  readonly caught: number
  readonly violating: number
  readonly allowed: number
  readonly allowedTotal: number
  /** Calls the classifier got wrong: a missed violation or a blocked allowed call. */
  readonly mistakes: ReadonlyArray<GuardTestedCall>
}

export const isMistake = (call: GuardTestedCall): boolean => call.triggered !== call.violates

export const scoreSelfTest = (calls: ReadonlyArray<GuardTestedCall>): SelfTestScore => {
  const violating = calls.filter((call) => call.violates)
  const allowed = calls.filter((call) => !call.violates)
  return {
    caught: violating.filter((call) => call.triggered).length,
    violating: violating.length,
    allowed: allowed.filter((call) => !call.triggered).length,
    allowedTotal: allowed.length,
    mistakes: calls.filter(isMistake)
  }
}

/** "Caught 5 of 5 calls that break it · allowed 5 of 5 that don't". */
export const selfTestSummary = (selfTest: Pick<GuardSelfTest, "calls">): string => {
  const score = scoreSelfTest(selfTest.calls)
  return `Caught ${score.caught} of ${score.violating} calls that break it · allowed ${score.allowed} of ${score.allowedTotal} that don't`
}

/** Mistakes per call; lower is better. An empty test set scores as perfect only against another empty one. */
export const mistakeRate = (calls: ReadonlyArray<GuardTestedCall>): number =>
  calls.length === 0 ? 1 : scoreSelfTest(calls).mistakes.length / calls.length

/** The background self-test has not finished yet: the page polls until it has. */
export const selfTestRunning = (selfTest: Pick<GuardSelfTest, "status"> | undefined): boolean => selfTest?.status === "running"
