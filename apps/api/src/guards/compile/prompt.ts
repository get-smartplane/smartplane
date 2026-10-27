import { unnamedSystemNote } from "./breadth"
import { type FewShot, fewShot } from "./few-shot"

export { fewShotVocabulary } from "./few-shot"

/** The compiler prompt. Few-shot rules live in `few-shot.ts`; `reviewDraft` checks their wording never leaks. */
export const systemPrompt = `You compile a plain-language policy rule for a classifier that guards AI agents' tool calls.
For each call the classifier sees: actor (role, teamNames; email only for rules that name people), resource
(kind, name, product, accountMode), connection (the account it acts as: mode; accountIdentity only for rules
that name that account, e.g. "billing@"), tool name, title and description, the arguments,
argumentHints (names read from URLs) and, when known, pinned (named things the call touches). It answers your question.

Return JSON:
1. intent.mode: "require_approval" for "without my/X's permission|approval|sign-off", "ask before", "needs X's
   sign-off"; "monitor" for "alert me", "let me know", "notify", "watch", "flag"; otherwise "enforce".
   intent.approvers (require_approval only): "my"/"ask" = {"kind":"author"}; {"kind":"role"|"team"|"user","ref":...}
   with ref exactly as the rule writes it ("Dana", "dana@example.com", "the security team"); people are looked up later.
   intent.cue: the rule's words that decided the mode.
   intent.operations: what the rule governs on its target, from "create" (adding items into it), "update",
   "delete", "read". Changing a list, database, folder or channel covers adding, editing and removing its items.
2. tools: exact listed tool names whose calls can break the rule ([] when no tools are listed).
3. instructions: ONE yes/no question, "yes" exactly when the call does what the rule governs. Two to four sentences.
   - Name the operation and the target in the rule's own nouns, then the governing tools by exact listed name with
     the argument shapes that match (command, property, state, what the target's name or URL looks like). Adding,
     removing or moving items of the protected thing counts. Say that a call naming the target only by an opaque
     id counts when the change only fits it. Then say what does not count (reads, other targets).
   - Never put ids, URLs or names in it that the rule or context does not contain.
   - For require_approval and monitor, never mention permission, approval, sign-off or alerts: ask only about the action.
   - Actor conditions only when the rule states them ("only finance can"); never invent role exceptions.
   - Rules about an account ("the shared billing@ Gmail") match connection.accountIdentity, not the actor.
   - Never reuse wording from the worked example.
4. examples: 4 to 6 calls, at least 2 that break the rule (violates: true) and 2 near misses on the same system
   (violates: false). With listed tools each is {"tool": exact name, "arguments": realistic JSON with made-up ids,
   "action": a few words}; otherwise {"action": a log line}. Vary the actor only for actor conditions.`

export interface PromptTools {
  /** One rendered line block per tool (see `describeTool`), most relevant first. */
  readonly lines: ReadonlyArray<string>
  /** Targets with no tool list: what the catalog says they do. */
  readonly notes: ReadonlyArray<string>
  /** The rule names none of these systems (they come from its scope): the tools only illustrate it. */
  readonly unnamed?: boolean
}

const toolSection = (tools: PromptTools | undefined) => {
  if (tools === undefined || (tools.lines.length === 0 && tools.notes.length === 0)) return ""
  const heading = tools.unnamed === true ? "Tools of the system this rule is scoped to" : "Tools of the systems this rule names"
  const listed = tools.lines.length === 0 ? "" : `\n\n${heading} (name [access] "title": description; args, * = required):\n${tools.lines.join("\n")}`
  const notes = tools.notes.length === 0 ? "" : `\n\nSystems named without a tool list:\n${tools.notes.join("\n")}`
  return `${listed}${notes}${tools.unnamed === true ? `\n\n${unnamedSystemNote}` : ""}`
}

export const userMessage = (rule: string, orgContext: string, tools?: PromptTools) =>
  `Rule:\n${rule}\n\nOrganisation context:\n${orgContext}${toolSection(tools)}`

/** System prompt, then the worked example(s) as prior turns, then the rule to compile. One example holds quality (see the eval). */
export const compilerMessages = (rule: string, orgContext: string, correction?: string, tools?: PromptTools, shots: ReadonlyArray<FewShot> = fewShot.slice(0, 1)) => [
  { role: "system", content: systemPrompt },
  ...shots.flatMap((shot) => [
    { role: "user", content: userMessage(shot.rule, "(example organisation)", shot.tools === undefined ? undefined : { lines: [shot.tools], notes: [] }) },
    { role: "assistant", content: JSON.stringify(shot.answer) }
  ]),
  {
    role: "user",
    content: correction === undefined
      ? userMessage(rule, orgContext, tools)
      : `${userMessage(rule, orgContext, tools)}\n\nA previous draft had these problems; avoid them:\n${correction}`
  }
]

const approverRef = {
  type: "object",
  properties: { kind: { type: "string", enum: ["author", "role", "team", "user"] }, ref: { type: "string" } },
  required: ["kind"]
}

export const draftJsonSchema = {
  type: "object",
  properties: {
    intent: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["enforce", "monitor", "require_approval"] },
        approvers: { type: "array", items: approverRef },
        cue: { type: "string" },
        operations: { type: "array", items: { type: "string", enum: ["create", "update", "delete", "read"] } }
      },
      required: ["mode", "approvers"]
    },
    tools: { type: "array", items: { type: "string" } },
    instructions: { type: "string" },
    examples: {
      type: "array",
      items: {
        type: "object",
        properties: { tool: { type: "string" }, arguments: { type: "object" }, action: { type: "string" }, violates: { type: "boolean" } },
        required: ["action", "violates"]
      }
    }
  },
  required: ["intent", "tools", "instructions", "examples"]
}
