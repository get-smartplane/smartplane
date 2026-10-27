import type { GatewayTool } from "../provider"
import { searchTools } from "./rank"

/** Edit distance, for a mistyped name the word ranker cannot help with ("linaer__create_isue"). */
const distance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/**
 * The closest names to one that is not in the caller's catalog: the search ranker on its words first, edit
 * distance when no word matches. Only the caller's own tools are candidates, so nothing hidden leaks.
 */
export const suggestNames = (tools: ReadonlyArray<GatewayTool>, name: string, count = 3): ReadonlyArray<string> => {
  const ranked = searchTools(tools, name.replace(/__/g, " "), { limit: count }).tools.map((tool) => tool.definition.name)
  if (ranked.length > 0) return ranked
  const lowered = name.toLowerCase()
  const cutoff = Math.max(3, Math.floor(lowered.length / 3))
  return tools
    .map((tool) => ({ name: tool.definition.name, far: distance(lowered, tool.definition.name.toLowerCase()) }))
    .filter((candidate) => candidate.far <= cutoff)
    .sort((a, b) => a.far - b.far || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, count)
    .map((candidate) => candidate.name)
}

/** The refusal for an unknown name, with the closest names when there are any. */
export const unknownToolText = (name: string, suggestions: ReadonlyArray<string>): string =>
  [
    `Tool "${name}" is not available to you.`,
    suggestions.length > 0 ? `Did you mean: ${suggestions.join(", ")}?` : null,
    "Use smartplane__search_tools to find tools by what they do."
  ].filter((part) => part !== null).join(" ")
