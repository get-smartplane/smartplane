import { type GrantConditions, InvalidInput, type Resource } from "@pc/domain"
import { Effect } from "effect"

const toolKinds: ReadonlyArray<Resource["config"]["kind"]> = ["mcp_server", "integration"]
const argumentKinds: ReadonlyArray<Resource["config"]["kind"]> = ["mcp_server", "tool", "integration"]

const invalid = (message: string, field: string) => Effect.fail(new InvalidInput({ message, field }))

/**
 * Conditions must be able to mean something on the resource: tool allow-lists on MCP servers and
 * integrations (by upstream tool or action name), argument constraints on those and on single tools.
 * A constraint on a tool the grant does not list could never apply, so it is refused rather than ignored.
 */
export const checkGrantConditions = (resource: Resource, conditions: GrantConditions): Effect.Effect<void, InvalidInput> => {
  const kind = resource.config.kind
  if (conditions.tools !== undefined && !toolKinds.includes(kind)) {
    return invalid("tool allow-lists apply to MCP servers and integrations only", "conditions.tools")
  }
  if (conditions.arguments === undefined) return Effect.void
  if (!argumentKinds.includes(kind)) return invalid("argument constraints apply to MCP servers, tools and integrations only", "conditions.arguments")
  const unlisted = Object.keys(conditions.arguments).filter((tool) => conditions.tools !== undefined && !conditions.tools.includes(tool))
  if (unlisted.length > 0) return invalid(`argument constraints name tools the grant does not allow: ${unlisted.join(", ")}`, "conditions.arguments")
  const config = resource.config
  if (config.kind === "tool" && Object.keys(conditions.arguments).some((tool) => tool !== config.toolName)) {
    return invalid(`a single-tool grant can only constrain ${config.toolName}`, "conditions.arguments")
  }
  return Effect.void
}
