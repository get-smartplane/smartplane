import type { GuardToolCall } from "@pc/domain"
import { Context, Duration, Effect, Layer, Option, Schema } from "effect"
import { canonicalJson } from "../../audit/canonical-json"
import { WorkersAi } from "../../platform/ai"
import { AppConfig, backgroundModel } from "../../platform/config"
import { KvCache } from "../../platform/kv"
import { redactCredentials } from "../classifier-state"
import type { ToolDoc } from "../grounding/tool-doc"
import { exampleJsonSchema, exampleMessages } from "./example-prompt"
import { type ModelCall, runModel } from "../model-call"
import { unfenceModelOutput } from "../model-output"

/** A generated call as cached: named by the upstream tool, so any resource of the same server can reuse it. */
const CachedCall = Schema.Struct({ arguments: Schema.Json, violates: Schema.Boolean, note: Schema.optionalKey(Schema.String) })
const CachedCalls = Schema.Array(CachedCall)
type CachedCall = typeof CachedCall.Type

const Generated = Schema.Struct({
  calls: Schema.Array(Schema.Struct({ tool: Schema.String, arguments: Schema.Unknown, violates: Schema.Boolean, note: Schema.optional(Schema.String) }))
})
const GeneratedResponse = Schema.Union([
  Schema.Struct({ response: Schema.Union([Schema.fromJsonString(Generated), Generated]) }),
  Schema.Struct({ choices: Schema.NonEmptyArray(Schema.Struct({ message: Schema.Struct({ content: Schema.fromJsonString(Generated) }) })) })
])

/**
 * Runs in verify's background `testing` stage, so it may take longer than a draft: DeepSeek writing calls for
 * six tools took over 30 s in 3 of 5 runs on `wrangler dev` (2026-10-24). Past this the run tests the draft's own examples.
 */
export const examplesCall = (model: string): ModelCall => ({ model, purpose: "examples", timeout: Duration.seconds(60), reasoning: "low" })

/** Thirty days: tools and their schemas change rarely, and a schema change gets a new key anyway. */
export const ExampleTtlSeconds = 30 * 24 * 3600
const MaxPerTool = 4

const sha256 = (text: string) =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24)
  })

/** The tool's identity for caching: its name, description and input schema. A changed schema is a new tool. */
export const schemaHash = (doc: ToolDoc) => sha256(canonicalJson({ name: doc.name, description: doc.description, inputSchema: doc.inputSchema }))

/**
 * KV key of the calls generated for one tool and one rule: `(server or piece, tool name, schema hash)`, plus
 * the rule's hash, because whether a call breaks the rule depends on the rule. Generation sees only the
 * rule text and the tool's public schema, never org data, so equal keys mean equal inputs.
 */
export const exampleKey = (doc: ToolDoc, schema: string, rule: string) =>
  Effect.map(sha256(rule.trim().toLowerCase().replace(/\s+/g, " ")), (ruleHash) => `guard-examples:v1:${doc.origin}:${doc.name}:${schema}:${ruleHash}`)

const toCall = (doc: ToolDoc, cached: CachedCall): GuardToolCall => ({
  tool: doc.gatewayName,
  resourceId: doc.resourceId,
  arguments: cached.arguments,
  violates: cached.violates,
  ...(cached.note === undefined ? {} : { note: cached.note })
})

const decodeJson = Schema.decodeUnknownOption(Schema.Json)

/**
 * Example calls per tool for a rule: violating calls and near misses, written by the compiler's model
 * family from each tool's schema and description. Produced once per key and cached in KV; tools without
 * a cached entry are generated together in one model call. Never calls the real upstream. Best effort:
 * a failed or timed-out generation yields no calls and the self-test carries on with the draft's own examples.
 */
export class ExampleCalls extends Context.Service<ExampleCalls, {
  readonly forRule: (rule: string, tools: ReadonlyArray<ToolDoc>) => Effect.Effect<ReadonlyArray<GuardToolCall>>
}>()("api/guards/ExampleCalls") {
  static readonly make = (model: string) =>
    Effect.gen(function*() {
      const ai = yield* WorkersAi
      const cache = yield* KvCache

      const generate = (rule: string, tools: ReadonlyArray<ToolDoc>) =>
        runModel(ai, examplesCall(model), { messages: exampleMessages(rule, tools), response_format: { type: "json_schema", json_schema: exampleJsonSchema }, temperature: 0.4, max_tokens: 6144 }).pipe(
          Effect.flatMap((raw) => Schema.decodeUnknownEffect(GeneratedResponse)(unfenceModelOutput(raw))),
          Effect.map((decoded) => ("response" in decoded ? decoded.response : decoded.choices[0].message.content).calls),
          Effect.map((calls) =>
            new Map(tools.map((doc) => [doc.name, calls.filter((call) => call.tool === doc.name || call.tool.endsWith(`__${doc.name}`)).slice(0, MaxPerTool).flatMap((call): ReadonlyArray<CachedCall> => {
              // Generated text never carries credentials onward, whatever the model wrote.
              const args = decodeJson(redactCredentials(call.arguments))
              if (Option.isNone(args) || typeof args.value !== "object" || args.value === null || Array.isArray(args.value)) return []
              return [{ arguments: args.value, violates: call.violates, ...(call.note === undefined ? {} : { note: call.note.slice(0, 200) }) }]
            })]))
          )
        )

      const forRule = Effect.fn("ExampleCalls.forRule")(function*(rule: string, tools: ReadonlyArray<ToolDoc>) {
        const keyed = yield* Effect.forEach(tools, (doc) => Effect.map(Effect.flatMap(schemaHash(doc), (hash) => exampleKey(doc, hash, rule)), (key) => ({ doc, key })))
        const cached = yield* Effect.forEach(keyed, ({ doc, key }) => Effect.map(cache.get(key, CachedCalls), (hit) => ({ doc, key, hit })))
        const missing = cached.filter((entry) => Option.isNone(entry.hit))
        yield* Effect.annotateCurrentSpan({ "examples.tools": tools.length, "examples.generated": missing.length })
        const fresh = missing.length === 0
          ? new Map<string, ReadonlyArray<CachedCall>>()
          : yield* generate(rule, missing.map((entry) => entry.doc)).pipe(
            Effect.tap((generated) => Effect.forEach(missing, ({ doc, key }) => {
              const calls = generated.get(doc.name) ?? []
              return calls.length === 0 ? Effect.void : cache.set(key, CachedCalls, calls, ExampleTtlSeconds)
            })),
            Effect.catch((error) => Effect.as(Effect.logWarning("example generation failed", String(error)), new Map<string, ReadonlyArray<CachedCall>>()))
          )
        return cached.flatMap(({ doc, hit }) => (Option.isSome(hit) ? hit.value : fresh.get(doc.name) ?? []).map((call) => toCall(doc, call)))
      })

      return ExampleCalls.of({ forRule })
    })

  static readonly layer = Layer.effect(ExampleCalls, Effect.gen(function*() {
    return yield* ExampleCalls.make(backgroundModel(yield* AppConfig))
  }))
}
