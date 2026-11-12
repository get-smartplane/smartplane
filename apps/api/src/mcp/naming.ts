import type { Resource } from "@pc/domain"
import { slugify } from "../platform/ids"

/** Gateway tool names are namespaced `<resource-slug>__<operation>` so different resources never collide by design. */
export const Separator = "__"

export const toolName = (resource: Resource, operation: string): string => `${slugify(resource.name)}${Separator}${operation}`

/** How a resource-backed tool introduces itself to the agent. */
export const describe = (resource: Resource, ...parts: ReadonlyArray<string>): string =>
  [`[${resource.name}]`, ...parts].map((part) => part.trim()).filter((part) => part.length > 0).join(" ")

/** The `<resource-slug>` a tool name is namespaced under, or `null` for built-ins, which have no prefix. Slugs never contain `_`. */
export const namespaceOf = (name: string): string | null => {
  const at = name.indexOf(Separator)
  return at === -1 ? null : name.slice(0, at)
}

/** Whether `resource`'s tools can be named in `namespace`; `undefined` means every namespace is wanted. */
export const inNamespace = (namespace: string | null | undefined, resource: Resource): boolean =>
  namespace === undefined || namespace === slugify(resource.name)
