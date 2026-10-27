import type { ModelTimedOut, UpstreamFailure } from "@pc/domain"
import { Duration, Effect, Schema } from "effect"
import type { WorkersAi } from "../../platform/ai"
import { describeTool, type ToolDoc } from "../grounding/tool-doc"
import { type ModelCall, runModel } from "../model-call"
import { unfenceModelOutput } from "../model-output"

const Pick = Schema.Struct({
  mention: Schema.NullOr(Schema.String),
  tool: Schema.NullOr(Schema.String),
  arguments: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})
export type Pick = typeof Pick.Type

const PickResponse = Schema.Union([
  Schema.Struct({ response: Schema.Union([Schema.fromJsonString(Pick), Pick]) }),
  Schema.Struct({ choices: Schema.NonEmptyArray(Schema.Struct({ message: Schema.Struct({ content: Schema.fromJsonString(Pick) }) })) })
])

const schema = {
  type: "object",
  // Plain strings ("" for none): a ["string", "null"] union breaks guided JSON decoding on some models.
  properties: { mention: { type: "string" }, tool: { type: "string" }, arguments: { type: "object" } },
  // All keys required: with an optional key left open, guided decoding sometimes pads whitespace until max_tokens.
  required: ["mention", "tool", "arguments"]
}

const system = `A policy rule may name one specific thing inside an integration: "the todo list", "the Q3 folder",
"#general", "the billing repo", "project Apollo". You get the rule and read-only tools of the systems it names.
Return JSON {"mention", "tool", "arguments"}:
- mention: the rule's words for that one thing, e.g. "todo list"; "" when the rule is about a whole system or a
  kind of thing ("issues", "any page", "pull requests", "emails").
- tool: the exact listed name of the tool that finds it by name, preferring search over list; "" if none fits.
- arguments: that tool's arguments, searching for the thing's name in its usual spelling (query "Todo" for
  "todo list"); no ids, nothing invented.`

/** The picker's model settings: small and quick, since it runs while the draft compiles. */
export const pickCall = (model: string): ModelCall => ({ model, purpose: "pin-lookup", timeout: Duration.seconds(8), reasoning: "low" })

/**
 * One small model call: does the rule name a specific thing, and which of the read-only tools (with which
 * arguments) looks it up. The tool is checked against the listed ones by the caller, never trusted.
 */
export const pickLookup = (ai: WorkersAi["Service"], call: ModelCall, rule: string, reads: ReadonlyArray<ToolDoc>): Effect.Effect<Pick, UpstreamFailure | ModelTimedOut | Schema.SchemaError> =>
  runModel(ai, call, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Rule:\n${rule}\n\nRead-only tools:\n${reads.map(describeTool).join("\n") || "(none)"}` }
    ],
    response_format: { type: "json_schema", json_schema: schema },
    temperature: 0,
    // A pick is ~50 tokens; a small cap makes a runaway answer fail fast instead of eating the timeout.
    max_tokens: 400
  }).pipe(
    Effect.flatMap((raw) => Schema.decodeUnknownEffect(PickResponse)(unfenceModelOutput(raw))),
    Effect.map((decoded) => ("response" in decoded ? decoded.response : decoded.choices[0].message.content)),
    Effect.map((pick) => ({ ...pick, mention: pick.mention?.trim() || null, tool: pick.tool?.trim() || null }))
  )
