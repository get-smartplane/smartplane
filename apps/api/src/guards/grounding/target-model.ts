import type { Resource } from "@pc/domain"
import { Duration, Effect, Schema } from "effect"
import type { WorkersAi } from "../../platform/ai"
import { productName } from "./products"
import type { TargetMatch } from "./targets"
import { runModel } from "../model-call"
import { unfenceModelOutput } from "../model-output"

const Picked = Schema.Struct({ resourceIds: Schema.Array(Schema.String) })
const PickedResponse = Schema.Union([
  Schema.Struct({ response: Schema.Union([Schema.fromJsonString(Picked), Picked]) }),
  Schema.Struct({ choices: Schema.NonEmptyArray(Schema.Struct({ message: Schema.Struct({ content: Schema.fromJsonString(Picked) }) })) })
])

const schema = {
  type: "object",
  properties: { resourceIds: { type: "array", items: { type: "string" } } },
  required: ["resourceIds"]
}

const system = `You map a plain-language policy rule to the systems it governs. You get the rule and a list of
resources (id, kind, product, name, description). Return the ids of the resources the rule is about, judged
by what the rule describes (e.g. "the wiki" is a docs tool, "tickets" an issue tracker), not by guessing.
Return an empty list when the rule is not about any listed resource or could be about all of them.
Respond with JSON only: {"resourceIds": [...]}`

/**
 * The fallback for rules that name no resource or product outright ("nobody edits the wiki"). Best effort:
 * a failure, a timeout (6 s) or an unknown id yields no targets, and the deterministic matcher always runs first.
 */
export const modelTargets = (ai: WorkersAi["Service"], model: string, rule: string, resources: ReadonlyArray<Resource>) =>
  Effect.gen(function*() {
    if (resources.length === 0) return []
    const listing = resources.slice(0, 60).map((r) => `- ${r.id} | ${r.config.kind} | ${productName(r)} | ${r.name} | ${r.description.slice(0, 120)}`).join("\n")
    const raw = yield* runModel(ai, { model, purpose: "targets", timeout: Duration.seconds(6), reasoning: "low" }, {
      messages: [{ role: "system", content: system }, { role: "user", content: `Rule:\n${rule}\n\nResources:\n${listing}` }],
      response_format: { type: "json_schema", json_schema: schema },
      temperature: 0,
      max_tokens: 512
    })
    const decoded = yield* Schema.decodeUnknownEffect(PickedResponse)(unfenceModelOutput(raw))
    const picked = "response" in decoded ? decoded.response : decoded.choices[0].message.content
    return resources
      .filter((resource) => picked.resourceIds.includes(resource.id))
      .slice(0, 4)
      .map((resource): TargetMatch => ({ resource, product: productName(resource), matched: "model", mention: "" }))
  }).pipe(
    Effect.withSpan("GuardTargets.model"),
    Effect.catch(() => Effect.succeed<ReadonlyArray<TargetMatch>>([]))
  )
