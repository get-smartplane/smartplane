import { assert, describe, it } from "@effect/vitest"
import { defaultSkillScanPolicy, type ScanReport, type SkillVersion, UpstreamFailure } from "@pc/domain"
import { Effect, Layer } from "effect"
import { Classifier } from "../../guards/classifier"
import { now, userId } from "../../testing/fixtures"
import { parseSkillMarkdown } from "../bundle/frontmatter"
import { clefQuestions, findingsOf, makeClefScanner, severityOfProbability } from "./clef"
import type { ScanInput } from "./scanner"
import { isServable, verdictOf } from "./verdict"

const input: ScanInput = { folder: "", files: [], skillMd: parseSkillMarkdown("---\nname: a\ndescription: b\n---\nBody") }

const clefWith = (answer: Effect.Effect<ReadonlyMap<string, number>, UpstreamFailure>) =>
  Effect.provide(makeClefScanner, Layer.succeed(Classifier, { classify: () => answer }))

describe("Clef scanner", () => {
  it("maps calibrated probabilities to severities", () => {
    assert.deepStrictEqual([0.95, 0.9, 0.75, 0.5, 0.49].map(severityOfProbability), ["high", "high", "medium", "low", undefined])
  })

  it("turns yes-leaning answers into findings, one per question", () => {
    const findings = findingsOf(new Map([["prompt_injection", 0.93], ["data_exfiltration", 0.2], ["unknown", 0.99]]))
    assert.deepStrictEqual(findings.map((finding) => [finding.ruleId, finding.severity]), [["clef/prompt_injection", "high"]])
  })

  it.effect("asks every question and reports passed when Clef leans no", () =>
    Effect.gen(function*() {
      const asked: Array<string> = []
      const scanner = yield* Effect.provide(makeClefScanner, Layer.succeed(Classifier, {
        classify: (_state, questions) => Effect.sync(() => (asked.push(...questions.keys()), new Map(Array.from(questions.keys(), (id) => [id, 0.1]))))
      }))
      const report = yield* scanner.scan(input)
      assert.deepStrictEqual([report.status, report.findings.length, asked], ["passed", 0, clefQuestions.map((question) => question.id)])
    }))

  it.effect("reports `error`, never `passed`, when Clef is unavailable", () =>
    Effect.gen(function*() {
      const scanner = yield* clefWith(Effect.fail(new UpstreamFailure({ upstream: "clef", message: "timed out" })))
      const report = yield* scanner.scan(input)
      assert.deepStrictEqual([report.status, report.findings[0]?.ruleId], ["error", "clef/unavailable"])
    }))
})

const report = (scanner: string, status: ScanReport["status"], severities: ReadonlyArray<ScanReport["findings"][number]["severity"]>): ScanReport => ({
  scanner,
  status,
  findings: severities.map((severity, index) => ({ scanner, ruleId: `${scanner}/r${index}`, severity, title: "t", detail: "d" })),
  toolVersion: "1",
  startedAt: now,
  finishedAt: now
})

describe("scan verdicts under the org policy", () => {
  it("blocks at the policy threshold, else errors, flags or passes", () => {
    const policy = defaultSkillScanPolicy
    assert.strictEqual(verdictOf([report("builtin", "flagged", ["high"])], policy).status, "blocked")
    assert.strictEqual(verdictOf([report("builtin", "flagged", ["high"])], { ...policy, blockAt: "critical" }).status, "flagged")
    assert.strictEqual(verdictOf([report("builtin", "passed", []), report("clef", "error", ["info"])], policy).status, "error")
    assert.strictEqual(verdictOf([report("builtin", "flagged", ["medium"]), report("clef", "passed", [])], policy).status, "flagged")
    assert.strictEqual(verdictOf([report("builtin", "passed", ["info"])], policy).status, "passed")
    assert.strictEqual(verdictOf([report("x", "failed", [])], policy).status, "blocked")
    assert.deepStrictEqual(verdictOf([report("builtin", "flagged", ["low", "medium", "info"])], policy).summary, {
      findings: 2,
      maxSeverity: "medium",
      scanners: [{ scanner: "builtin", status: "flagged" }]
    })
  })

  const version = (scanStatus: SkillVersion["scanStatus"], override: SkillVersion["override"] = null) => ({ scanStatus, override })
  const statuses: ReadonlyArray<SkillVersion["scanStatus"]> = ["passed", "flagged", "blocked", "pending", "error", "skipped"]
  const strict = defaultSkillScanPolicy
  const lenient = { ...strict, requireScan: false }

  it("with scanning on: never serves blocked, serves unscanned only without requireScan, and honours overrides", () => {
    assert.deepStrictEqual(statuses.map((status) => isServable(version(status), strict, true)), [true, true, false, false, false, false])
    assert.deepStrictEqual(statuses.map((status) => isServable(version(status), lenient, true)), [true, true, false, true, true, true])
    const override = { by: userId, reason: "reviewed by security", at: now }
    assert.isTrue(isServable(version("blocked", override), strict, true))
  })

  it("with scanning off: serves everything but blocked, which still needs an override", () => {
    assert.deepStrictEqual(statuses.map((status) => isServable(version(status), strict, false)), [true, true, false, true, true, true])
    assert.isTrue(isServable(version("blocked", { by: userId, reason: "reviewed", at: now }), strict, false))
  })
})
