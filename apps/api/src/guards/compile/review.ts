import type { CompiledGuard, GuardMode } from "@pc/domain"
import { narrowedTo } from "./breadth"
import { fewShotVocabulary } from "./prompt"

/** A problem with a compiled draft that a reviewer (or a retry) should fix. */
export interface DraftIssue {
  readonly code:
    | "leaked_example"
    | "approval_in_question"
    | "invented_role_exception"
    | "one_sided_examples"
    | "too_few_examples"
    | "unknown_tool"
    | "no_tool_named"
    | "invented_id"
    | "narrowed_to_system"
  readonly detail: string
}

const approvalWords = /\b(permission|approv\w*|sign[- ]?off|consent|authori[sz]\w*)\b/i
const roleException = /\b(unless|except)\b[^.?]*\b(owner|admin|role)\b/i
const mentionsRoles = /\b(owner|admin|role|manager|lead)s?\b/i

/** The real tools the compiler was shown, and the tool names the draft used. */
export interface ToolCheck {
  readonly listed: ReadonlyArray<string>
  readonly referenced: ReadonlyArray<string>
  /** The rule names none of these products (they come from its scope), so the question must not confine itself to them. */
  readonly unnamedProducts?: ReadonlyArray<string>
}

/**
 * Checks a draft against what the rule says. Catches the failures seen in production: wording copied from
 * a prompt example, the approval condition folded into the classifier question (the approval mode already
 * handles it), role exceptions the rule never mentioned, and examples that do not test both outcomes.
 */
export const reviewDraft = (rule: string, mode: GuardMode, compiled: CompiledGuard, orgContext = "", tools?: ToolCheck): ReadonlyArray<DraftIssue> => {
  const issues: Array<DraftIssue> = []
  const source = `${rule}\n${orgContext}\n${tools?.listed.join("\n") ?? ""}`.toLowerCase()
  const text = [compiled.instructions, ...compiled.examples.map((e) => e.action)].join("\n").toLowerCase()
  const leaked = fewShotVocabulary.filter((word) => text.includes(word) && !source.includes(word))
  if (leaked.length > 0) issues.push({ code: "leaked_example", detail: `copied from a prompt example: ${leaked.join(", ")}` })
  if (mode === "require_approval" && approvalWords.test(compiled.instructions)) {
    issues.push({ code: "approval_in_question", detail: "the question mentions permission or approval; the mode handles that, ask only about the action" })
  }
  if (roleException.test(compiled.instructions) && !mentionsRoles.test(rule)) {
    issues.push({ code: "invented_role_exception", detail: "the question exempts roles the rule does not mention" })
  }
  if (tools !== undefined && tools.listed.length > 0) {
    const invented = [...new Set(tools.referenced.filter((name) => !tools.listed.includes(name)))]
    if (invented.length > 0) issues.push({ code: "unknown_tool", detail: `not a listed tool: ${invented.join(", ")}; use the exact listed names` })
    const question = compiled.instructions.toLowerCase()
    if (tools.unnamedProducts === undefined && !tools.listed.some((name) => question.includes(name.toLowerCase()) || question.includes(name.split("__").at(-1)?.toLowerCase() ?? name))) {
      issues.push({ code: "no_tool_named", detail: "the question names none of the listed tools; agents call tools with ids, so name the tools and argument shapes that match" })
    }
  }
  const narrowed = narrowedTo(rule, compiled.instructions, tools?.unnamedProducts ?? [])
  if (narrowed.length > 0) {
    issues.push({ code: "narrowed_to_system", detail: `the rule names no system, but the question limits it to ${narrowed.join(", ")}; ask about the action anywhere and give tools only as examples` })
  }
  const ids = (compiled.instructions.match(/\b(?:collection:\/\/)?[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b|collection:\/\/\S+/gi) ?? [])
    .filter((id) => !source.includes(id.toLowerCase()))
  if (ids.length > 0) issues.push({ code: "invented_id", detail: `the question names ids no rule or context gave (${ids.slice(0, 2).join(", ")}); describe targets by name instead` })
  const violating = compiled.examples.filter((e) => e.violates).length
  if (compiled.examples.length < 4) issues.push({ code: "too_few_examples", detail: `${compiled.examples.length} examples; write 4 to 6` })
  if (violating === 0 || violating === compiled.examples.length) {
    issues.push({ code: "one_sided_examples", detail: "examples must include both matching actions and near misses" })
  }
  return issues
}
