import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { CompiledGuard } from "./guard"
import type { GuardTestedCall } from "./guard-grounding"
import { mistakeRate, scoreSelfTest, selfTestSummary } from "./guard-self-test"

const call = (violates: boolean, triggered: boolean): GuardTestedCall => ({
  tool: "notion__notion-update-page",
  arguments: { page_id: "1f2e", properties: { Done: "__YES__" } },
  violates,
  source: "generated",
  probability: triggered ? 0.9 : 0.1,
  triggered
})

describe("guard self-test", () => {
  it("summarises caught violations and allowed near misses, listing the mistakes", () => {
    const calls = [call(true, true), call(true, false), call(false, false), call(false, false), call(false, true)]
    expect(selfTestSummary({ calls })).toBe("Caught 1 of 2 calls that break it · allowed 2 of 3 that don't")
    expect(scoreSelfTest(calls).mistakes).toEqual([calls[1], calls[4]])
    expect(mistakeRate(calls)).toBeCloseTo(0.4)
  })

  it("round-trips a compiled guard with grounding and tested calls through JSON", () => {
    const compiled = {
      instructions: "Does this call change the Notion to-do list?",
      examples: [],
      grounding: {
        targets: [{ resourceId: "res_notion0001", name: "Notion", product: "Notion", matched: "alias", mention: "notion", tools: "curated", toolCount: 14 }],
        unknown: [{ mention: "jira", product: "Atlassian" }],
        tools: ["notion__notion-update-page"]
      },
      selfTest: { threshold: 0.5, calls: [call(true, true)], retried: false }
    }
    const codec = Schema.toCodecJson(CompiledGuard)
    const decoded = Schema.decodeUnknownSync(codec)(compiled)
    expect(Schema.encodeSync(codec)(decoded)).toEqual(compiled)
  })
})
