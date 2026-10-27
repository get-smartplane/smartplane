import type { GuardApplies, GuardGrounding, GuardToolScope, ResourceId } from "@pc/domain"

/** "a", "a and b", "a, b and c". */
export const listWords = (items: ReadonlyArray<string>): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`

/** `notion-update-page` on Notion reads "update page"; `push_files` reads "push files". */
export const toolLabel = (name: string, product = ""): string => {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").trim().toLowerCase()
  const prefix = product.toLowerCase()
  return prefix !== "" && words.startsWith(`${prefix} `) ? words.slice(prefix.length + 1) : words
}

/** A resource's name as the rule page shows it: the product, and the resource's own name when it differs. */
export const resourceName = (grounding: GuardGrounding | undefined, id: ResourceId): string => {
  const target = grounding?.targets.find((candidate) => candidate.resourceId === id)
  if (target === undefined) return "a resource"
  return target.name === target.product ? target.product : `${target.product} (${target.name})`
}

const productOf = (grounding: GuardGrounding | undefined, id: ResourceId) => grounding?.targets.find((target) => target.resourceId === id)?.product ?? ""

/**
 * The tools of one resource it checks, in words, and the ones verify saw that it leaves out. `named`: say
 * which resource, when the filter has tool lists for more than one.
 */
export const toolWords = (scope: GuardToolScope, grounding: GuardGrounding | undefined, named = false) => {
  const product = productOf(grounding, scope.resourceId)
  const only = listWords(scope.only.map((name) => toolLabel(name, product)))
  const skipped = scope.known.filter((name) => !scope.only.includes(name)).map((name) => toolLabel(name, product))
  return { checks: named ? `${only} on ${resourceName(grounding, scope.resourceId)}` : only, skips: listWords(skipped) }
}

/** The dimensions of a filter that narrow anything, in the order the rule page lists them. */
export type Dimension = "resources" | "tools" | "operations" | "actors"

export const dimensionsOf = (applies: GuardApplies): ReadonlyArray<Dimension> => [
  ...(applies.resourceIds.length > 0 ? ["resources" as const] : []),
  ...((applies.tools ?? []).length > 0 ? ["tools" as const] : []),
  ...(applies.operations === undefined ? [] : ["operations" as const]),
  ...(applies.actors === undefined ? [] : ["actors" as const])
]

/** The filter without one dimension: what "remove" on its chip does while editing. */
export const without = (applies: GuardApplies, dimension: Dimension): GuardApplies => {
  const { tools: _tools, operations: _operations, actors: _actors, ...rest } = applies
  switch (dimension) {
    case "resources":
      // Tool lists name their resource: they go with it.
      return { ...rest, resourceIds: [], ...(applies.operations === undefined ? {} : { operations: applies.operations }), ...(applies.actors === undefined ? {} : { actors: applies.actors }) }
    case "tools":
      return { ...rest, ...(applies.operations === undefined ? {} : { operations: applies.operations }), ...(applies.actors === undefined ? {} : { actors: applies.actors }) }
    case "operations":
      return { ...rest, ...(applies.tools === undefined ? {} : { tools: applies.tools }), ...(applies.actors === undefined ? {} : { actors: applies.actors }) }
    case "actors":
      return { ...rest, ...(applies.tools === undefined ? {} : { tools: applies.tools }), ...(applies.operations === undefined ? {} : { operations: applies.operations }) }
  }
}
