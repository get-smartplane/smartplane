import type { CompiledGuard, GuardApplies, GuardToolCall, GuardToolScope, ResourceId, ToolAccess } from "@pc/domain"
import { namesNoSystem } from "../compile/breadth"
import type { OrgDirectory } from "../compile/directory"
import type { StoredToolDoc } from "../grounding/tool-doc"
import { readActors } from "./actors"

export interface DeriveInput {
  readonly rule: string
  /** The draft: what it governs (`operations`), the tools it named (`tools`) and the systems it found (`grounding`). */
  readonly compiled: CompiledGuard
  /** The tools verify ranked and showed the compiler: all it knows about each target's tools. */
  readonly tools: ReadonlyArray<StoredToolDoc>
  /** Calls known to break the rule (the draft's own and the self-test's): each must stay inside the filter. */
  readonly violating: ReadonlyArray<GuardToolCall>
  readonly directory: OrgDirectory
}

const byResource = (docs: ReadonlyArray<StoredToolDoc>) => {
  const grouped = new Map<ResourceId, Array<StoredToolDoc>>()
  for (const doc of docs) grouped.set(doc.resourceId, [...(grouped.get(doc.resourceId) ?? []), doc])
  return grouped
}

const accessOf = (docs: ReadonlyArray<StoredToolDoc>, gatewayName: string): ToolAccess | undefined => docs.find((doc) => doc.gatewayName === gatewayName)?.access

/**
 * The calls a rule is about, from what verify found, for an admin to accept. Narrow only where verify is sure:
 * - resources: only when every system it found was named in the rule or its scope; a rule about anything
 *   ("never send customer data outside the company"), or one whose systems a model guessed, gets no filter;
 * - tools: per resource, the tools the draft named plus every tool a violating call used, among those verify
 *   looked at; tools it did not look at (and ones added later) stay in, judged by operation class;
 * - operations: only tools that may change something, when the rule governs no reads and no violating call
 *   used a read-only tool;
 * - actors: from unambiguous wording only (`readActors`).
 */
export const deriveApplies = (input: DeriveInput): GuardApplies | undefined => {
  const targets = input.compiled.grounding?.targets ?? []
  if (targets.length === 0 || targets.some((target) => target.matched === "model")) return undefined
  const resourceIds = [...new Set([...targets.map((target) => target.resourceId), ...input.violating.flatMap((call) => call.resourceId ?? [])])]
  const operations = input.compiled.operations
  const readsAllowed = operations === undefined || operations.length === 0 || operations.includes("read") ||
    input.violating.some((call) => accessOf(input.tools, call.tool) === "read")
  const named = new Set([...(input.compiled.tools ?? []), ...input.violating.map((call) => call.tool)])
  const tools: Array<GuardToolScope> = []
  // A rule naming no system covers every tool of its scope: the draft's tools only illustrate it.
  if (input.compiled.tools !== undefined && !namesNoSystem(input.compiled.grounding)) {
    for (const [resourceId, docs] of byResource(input.tools)) {
      if (!resourceIds.includes(resourceId)) continue
      const only = docs.filter((doc) => named.has(doc.gatewayName)).map((doc) => doc.name)
      // Naming none of a target's tools, or all of them, narrows nothing.
      if (only.length === 0 || only.length === docs.length) continue
      tools.push({ resourceId, only, known: docs.map((doc) => doc.name) })
    }
  }
  const actors = readActors(input.rule, input.directory)
  return {
    resourceIds,
    ...(tools.length === 0 ? {} : { tools }),
    ...(readsAllowed ? {} : { operations: "changes" as const }),
    ...(actors === undefined ? {} : { actors })
  }
}
