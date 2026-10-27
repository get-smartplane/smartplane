import { describe, expect, it } from "vitest"
import { ruleToAdd, splitRules } from "./split-rules"

describe("quick add", () => {
  it("an empty or blank Enter adds nothing", () => {
    expect(ruleToAdd("")).toBeUndefined()
    expect(ruleToAdd("   ")).toBeUndefined()
    expect(ruleToAdd("  Contractors can't push  ")).toBe("Contractors can't push")
  })

  it("a pasted list becomes one rule per line, without markers or blank lines", () => {
    expect(splitRules("- Contractors can't push to main\n\n2. Only finance can send invoices\r\n* [ ] Nobody deletes Q3 reports\n")).toEqual([
      "Contractors can't push to main",
      "Only finance can send invoices",
      "Nobody deletes Q3 reports"
    ])
    expect(splitRules("one rule only")).toEqual(["one rule only"])
  })
})
