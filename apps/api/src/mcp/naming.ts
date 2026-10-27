import type { Resource } from "@pc/domain"
import { slugify } from "../platform/ids"

/** Gateway tool names are namespaced `<resource-slug>__<operation>` so different resources never collide by design. */
export const Separator = "__"

export const toolName = (resource: Resource, operation: string): string => `${slugify(resource.name)}${Separator}${operation}`

/** How a resource-backed tool introduces itself to the agent. */
export const describe = (resource: Resource, ...parts: ReadonlyArray<string>): string =>
  [`[${resource.name}]`, ...parts].map((part) => part.trim()).filter((part) => part.length > 0).join(" ")
