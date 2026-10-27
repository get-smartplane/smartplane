import type { GuardMode } from "@pc/domain"

/** Common first rules, to start from rather than a blank box. */
export const ruleTemplates: ReadonlyArray<{ readonly label: string; readonly rule: string; readonly mode: GuardMode }> = [
  { label: "Protect a folder", rule: "Nobody deletes reports from the Q3 folder.", mode: "enforce" },
  { label: "No production writes", rule: "Agents never run INSERT, UPDATE or DELETE against the production database.", mode: "require_approval" },
  { label: "Keep secrets secret", rule: "No tool call may print or return a secret, password or API key.", mode: "enforce" },
  { label: "Watch customer data", rule: "Flag any export that includes customer email addresses.", mode: "monitor" }
]
