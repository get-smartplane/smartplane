import { type GuardExample, GuardMode, type GuardOperation, type GuardToolCall } from "@pc/domain"
import { Option, Schema } from "effect"
import { compactJson } from "../grounding/compact"

const ApproverRef = Schema.Struct({
  kind: Schema.Literals(["author", "role", "team", "user"]),
  ref: Schema.optionalKey(Schema.String)
})
export type ApproverRef = typeof ApproverRef.Type

/** An example as the model writes it: a tool call (tool + arguments) with a short note, or a log line. */
const DraftExample = Schema.Struct({
  action: Schema.optionalKey(Schema.String),
  tool: Schema.optionalKey(Schema.String),
  arguments: Schema.optionalKey(Schema.Unknown),
  violates: Schema.Boolean
})
export type DraftExample = typeof DraftExample.Type

/** The compiler model's output. Lenient where models drift (missing cue or tools, extra keys) and strict where it matters. */
export const CompilerDraft = Schema.Struct({
  intent: Schema.Struct({
    mode: GuardMode,
    approvers: Schema.Array(ApproverRef),
    cue: Schema.optionalKey(Schema.NullOr(Schema.String)),
    /** Free strings: models drift ("add", "edit"); `operationsOf` keeps what it recognises. */
    operations: Schema.optionalKey(Schema.Array(Schema.String))
  }),
  tools: Schema.optionalKey(Schema.Array(Schema.String)),
  instructions: Schema.NonEmptyString,
  examples: Schema.Array(DraftExample)
})
export type CompilerDraft = typeof CompilerDraft.Type

/**
 * Workers AI text models return `response` as a JSON string, or already parsed when a JSON schema is set.
 * OpenAI-compatible models (gpt-oss) answer in `choices[0].message.content` instead.
 */
const DraftPayload = Schema.Union([Schema.fromJsonString(CompilerDraft), CompilerDraft])
export const CompilerResponse = Schema.Union([
  Schema.Struct({ response: DraftPayload }),
  Schema.Struct({ choices: Schema.NonEmptyArray(Schema.Struct({ message: Schema.Struct({ content: DraftPayload }) })) })
])
export type CompilerResponse = typeof CompilerResponse.Type

export const draftOf = (response: CompilerResponse): CompilerDraft =>
  "response" in response ? response.response : response.choices[0].message.content

const operationWords: ReadonlyArray<readonly [GuardOperation, RegExp]> = [
  ["create", /^(?:create|add|append|insert|new|post)$/i],
  ["update", /^(?:update|edit|modify|change|move|rename)$/i],
  ["delete", /^(?:delete|remove|trash|archive|destroy)$/i],
  ["read", /^(?:read|view|list|export|download)$/i]
]

/** The kinds of change the model read from the rule, in the contract's words; unknown words are dropped. */
export const operationsOf = (draft: CompilerDraft): ReadonlyArray<GuardOperation> | undefined => {
  const words = draft.intent.operations
  if (words === undefined) return undefined
  const known = operationWords.filter(([, pattern]) => words.some((word) => pattern.test(word.trim()))).map(([operation]) => operation)
  return known.length === 0 ? undefined : known
}

const decodeJson = Schema.decodeUnknownOption(Schema.Json)
const isObject = (value: unknown): value is object => typeof value === "object" && value !== null && !Array.isArray(value)

/** The labelled examples the classifier question carries: a call reads `tool {args} (what it does)`. */
export const examplesOf = (draft: CompilerDraft): ReadonlyArray<GuardExample> =>
  draft.examples.flatMap((example) => {
    const note = example.action?.trim() ?? ""
    if (example.tool === undefined || example.tool.trim() === "") return note === "" ? [] : [{ action: note, violates: example.violates }]
    const call = `${example.tool.trim()} ${compactJson(example.arguments ?? {}, 220)}`
    return [{ action: note === "" ? call : `${call} (${note})`, violates: example.violates }]
  })

/** The draft's examples that are calls to one of `tools` (gateway name to resource), for the self-test. */
export const draftCalls = (draft: CompilerDraft, tools: ReadonlyMap<string, GuardToolCall["resourceId"]>): ReadonlyArray<GuardToolCall> =>
  draft.examples.flatMap((example) => {
    const tool = example.tool?.trim()
    if (tool === undefined || !tools.has(tool) || !isObject(example.arguments)) return []
    const args = decodeJson(example.arguments)
    if (Option.isNone(args)) return []
    const resourceId = tools.get(tool)
    const note = example.action?.trim().slice(0, 200)
    return [{ tool, arguments: args.value, violates: example.violates, ...(resourceId === undefined ? {} : { resourceId }), ...(note ? { note } : {}) }]
  })
