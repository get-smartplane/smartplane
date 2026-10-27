import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { initialOrgSetup, OnboardingProgress, UpdateMemberWelcome, UpdateOrgSetup } from "./onboarding"

const decodeUpdate = Schema.decodeUnknownExit(UpdateOrgSetup)

describe("onboarding progress", () => {
  it("accepts a partial update of a single step", () => {
    assert.isTrue(decodeUpdate({ steps: { rule: "skipped" } })._tag === "Success")
    assert.isTrue(decodeUpdate({ toolResourceId: null })._tag === "Success")
  })

  it("rejects unknown step states and ids from the wrong family", () => {
    assert.isTrue(decodeUpdate({ steps: { rule: "maybe" } })._tag === "Failure")
    assert.isTrue(decodeUpdate({ toolResourceId: "grd_notaresource" })._tag === "Failure")
  })

  it("lets a member finish or dismiss the welcome, never reopen it", () => {
    const decode = Schema.decodeUnknownExit(UpdateMemberWelcome)
    assert.isTrue(decode({ status: "dismissed" })._tag === "Success")
    assert.isTrue(decode({ status: "pending" })._tag === "Failure")
  })

  it("round-trips the initial progress through JSON", () => {
    const codec = Schema.toCodecJson(OnboardingProgress)
    const progress = { setup: initialOrgSetup(), welcome: { status: "pending" as const, updatedAt: null } }
    const json = Schema.encodeSync(codec)(progress)
    assert.deepStrictEqual(json, {
      setup: { status: "open", steps: { tool: "todo", access: "todo", rule: "todo", team: "todo", agent: "todo" }, toolResourceId: null, guardId: null, updatedAt: null },
      welcome: { status: "pending", updatedAt: null }
    })
    assert.deepStrictEqual(Schema.decodeUnknownSync(codec)(json).setup?.status, "open")
  })
})
