import type { ToolAccess } from "@pc/domain"
import { productName, productOf } from "../../guards/grounding/products"
import { stems } from "../../guards/grounding/rank"
import { Separator } from "../naming"
import type { GatewayTool } from "../provider"
import { toolSummaryOf } from "../tool-summary"

/** What built-ins (`skills_list`, `variables_get`, ...) count as for the `server` filter. */
export const BuiltinServer = "smartplane"

/** One field's word stems and how much a match in it counts. */
export interface Field {
  readonly words: ReadonlySet<string>
  readonly weight: number
}

/** A gateway tool prepared for matching: stems computed once per search, not once per query word. */
export interface IndexedTool {
  readonly tool: GatewayTool
  readonly name: string
  /** The part of the gateway name before `__`: the resource slug, or `smartplane` for built-ins. */
  readonly server: string
  /** Lower-case names the `server` filter accepts: slug, resource name, product name, key and aliases. */
  readonly serverNames: ReadonlySet<string>
  readonly access: ToolAccess
  readonly fields: ReadonlyArray<Field>
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

export const argumentNames = (inputSchema: unknown): ReadonlyArray<string> =>
  isRecord(inputSchema) && isRecord(inputSchema["properties"]) ? Object.keys(inputSchema["properties"]) : []

const field = (text: string, weight: number): Field => ({ words: new Set(stems(text)), weight })

export const serverOf = (name: string): string => {
  const at = name.indexOf(Separator)
  return at < 0 ? BuiltinServer : name.slice(0, at)
}

/**
 * The operation weighs most (it is what the tool does), then the server and product ("linear", "gh") and the
 * title; description and argument names add evidence. Upstream descriptions already start with `[Resource]`.
 */
export const indexTool = (tool: GatewayTool): IndexedTool => {
  const name = tool.definition.name
  const server = serverOf(name)
  const operation = name.slice(name.indexOf(Separator) < 0 ? 0 : name.indexOf(Separator) + Separator.length)
  const summary = toolSummaryOf(tool.definition)
  const resource = tool.target
  const product = resource === null ? undefined : productOf(resource)
  const serverNames = new Set([
    server,
    ...(resource === null ? [] : [resource.name.toLowerCase(), productName(resource).toLowerCase()]),
    ...(product === undefined ? [] : [product.key, ...product.aliases])
  ])
  return {
    tool,
    name,
    server,
    serverNames,
    access: summary.access,
    fields: [
      field(operation, 3),
      field([...serverNames].join(" "), 2),
      field(summary.title ?? "", 2),
      field(tool.definition.description ?? "", 1),
      field(argumentNames(tool.definition.inputSchema).join(" "), 1)
    ]
  }
}
