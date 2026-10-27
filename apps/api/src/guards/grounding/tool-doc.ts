import { type IntegrationAction, type Resource, ResourceId, ToolAccess } from "@pc/domain"
import { Option, Schema } from "effect"
import { annotationsFor } from "../../gateway-tools/integration/annotations"
import { toolName } from "../../mcp/naming"
import type { McpTool } from "../../mcp/sdk"
import { toolAccessOf, toolSummaryOf } from "../../mcp/tool-summary"
import { productName } from "./products"

/** One real tool of a target, as the compiler and the example generator see it. */
export interface ToolDoc {
  readonly resourceId: Resource["id"]
  /** Product display name, e.g. "Notion". */
  readonly product: string
  /** The server or piece the tool belongs to, the same for every org: `mcp:<url>` or `piece:<id>`. */
  readonly origin: string
  /** What the gateway calls it and the classifier sees: `<resource-slug>__<tool>`. */
  readonly gatewayName: string
  /** The upstream tool or action name: what `tool` holds in the classifier state. */
  readonly name: string
  readonly title?: string | undefined
  readonly description: string
  readonly inputSchema: unknown
  readonly access: ToolAccess
}

/** A tool doc as stored for the background self-test (KV): the same fields, with a JSON input schema. */
export const StoredToolDoc = Schema.Struct({
  resourceId: ResourceId,
  product: Schema.String,
  origin: Schema.String,
  gatewayName: Schema.String,
  name: Schema.String,
  title: Schema.optional(Schema.String),
  description: Schema.String,
  inputSchema: Schema.Json,
  access: ToolAccess
})
export type StoredToolDoc = typeof StoredToolDoc.Type

const decodeJson = Schema.decodeUnknownOption(Schema.Json)

export const storedToolDoc = (doc: ToolDoc): StoredToolDoc => ({
  ...doc,
  inputSchema: Option.getOrElse(decodeJson(doc.inputSchema), () => ({}))
})

export const fromListing = (resource: Resource, tool: McpTool): ToolDoc => {
  const summary = toolSummaryOf(tool)
  return {
    resourceId: resource.id,
    product: productName(resource),
    origin: resource.config.kind === "mcp_server" ? `mcp:${resource.config.url.replace(/\/+$/, "")}` : `resource:${resource.id}`,
    gatewayName: toolName(resource, tool.name),
    name: tool.name,
    title: summary.title,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema,
    access: summary.access
  }
}

export const fromAction = (resource: Resource, action: IntegrationAction): ToolDoc => ({
  resourceId: resource.id,
  product: productName(resource),
  origin: resource.config.kind === "integration" ? `piece:${resource.config.pieceId}` : `resource:${resource.id}`,
  gatewayName: toolName(resource, action.name),
  name: action.name,
  title: action.displayName,
  description: action.description,
  inputSchema: action.inputSchema,
  access: toolAccessOf(annotationsFor(action))
})

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const short = (text: unknown, max: number) => {
  if (typeof text !== "string") return ""
  const line = text.replace(/\s+/g, " ").trim()
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`
}

/** A JSON Schema type in a few characters: `"a"|"b"`, `string[]`, `{old_str, new_str}[]`. */
const typeOf = (schema: unknown, depth: number): string => {
  if (!isRecord(schema)) return "any"
  if (Array.isArray(schema["enum"])) return schema["enum"].slice(0, 8).map((value) => JSON.stringify(value)).join("|")
  const union = schema["anyOf"] ?? schema["oneOf"]
  if (Array.isArray(union)) return union.slice(0, 3).map((member) => typeOf(member, depth)).join("|")
  const type = Array.isArray(schema["type"]) ? schema["type"].join("|") : schema["type"]
  if (type === "array") return `${typeOf(schema["items"], depth)}[]`
  const properties = schema["properties"]
  if ((type === "object" || type === undefined) && isRecord(properties) && depth < 2) {
    const keys = Object.keys(properties).slice(0, 6)
    return `{${keys.map((key) => (depth === 0 ? `${key}: ${typeOf(properties[key], depth + 1)}` : key)).join(", ")}}`
  }
  return typeof type === "string" ? type : "any"
}

/**
 * A tool's arguments as one compact line: `page_id: string*, command: "update_properties"|"update_content",
 * properties?: object — ...`. Required arguments carry `*`; descriptions are cut short. Keeps the prompt small.
 */
export const signatureOf = (inputSchema: unknown, maxArgs = 7): string => {
  if (!isRecord(inputSchema) || !isRecord(inputSchema["properties"])) return ""
  const properties = inputSchema["properties"]
  const required = new Set(Array.isArray(inputSchema["required"]) ? inputSchema["required"].filter((key): key is string => typeof key === "string") : [])
  const keys = Object.keys(properties)
  const ordered = [...keys.filter((key) => required.has(key)), ...keys.filter((key) => !required.has(key))].slice(0, maxArgs)
  const args = ordered.map((key) => {
    const property = properties[key]
    const note = short(isRecord(property) ? property["description"] : undefined, 40)
    return `${key}${required.has(key) ? "*" : ""}: ${typeOf(property, 1)}${note === "" ? "" : ` (${note})`}`
  })
  return [...args, ...(keys.length > maxArgs ? [`+${keys.length - maxArgs} more`] : [])].join("; ")
}

/** One line per tool for the compiler prompt; the title is left out when the name already says it. */
export const describeTool = (doc: ToolDoc): string => {
  const title = doc.title !== undefined && doc.title.toLowerCase().replace(/\W/g, "") !== doc.name.toLowerCase().replace(/\W/g, "") ? ` "${doc.title}"` : ""
  return `- ${doc.gatewayName} [${doc.access}]${title}: ${short(doc.description, 140)}\n  args: ${signatureOf(doc.inputSchema) || "none"}`
}
