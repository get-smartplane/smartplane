import type { ToolAccess, UpstreamToolSummary } from "@pc/domain"
import { Option, Schema } from "effect"
import type { McpTool } from "./sdk"

/** The MCP `ToolAnnotations` fields shown in the dashboard; annotations that do not decode count as none. */
const Annotations = Schema.Struct({
  title: Schema.optional(Schema.String),
  readOnlyHint: Schema.optional(Schema.Boolean),
  destructiveHint: Schema.optional(Schema.Boolean),
  idempotentHint: Schema.optional(Schema.Boolean),
  openWorldHint: Schema.optional(Schema.Boolean)
})
type Annotations = typeof Annotations.Type

const decodeAnnotations = Schema.decodeUnknownOption(Annotations)

/**
 * MCP spec defaults: `destructiveHint` is meaningful only when `readOnlyHint` is false, and defaults to true.
 * So a tool that says only `readOnlyHint: false` is shown as destructive; one with no hints at all as unknown.
 */
export const toolAccessOf = (annotations: Annotations): ToolAccess => {
  if (annotations.readOnlyHint === true) return "read"
  if (annotations.destructiveHint === true) return "destructive"
  if (annotations.destructiveHint === false) return "write"
  if (annotations.readOnlyHint === false) return "destructive"
  return "unknown"
}

/** A listed upstream tool as the dashboard shows it; the input schema stays out of it. */
export const toolSummaryOf = (tool: McpTool): UpstreamToolSummary => {
  const annotations = Option.getOrElse(decodeAnnotations(tool.annotations ?? {}), (): Annotations => ({}))
  return {
    name: tool.name,
    ...(annotations.title === undefined ? {} : { title: annotations.title }),
    ...(tool.description === undefined ? {} : { description: tool.description }),
    access: toolAccessOf(annotations),
    ...(annotations.idempotentHint === undefined ? {} : { idempotent: annotations.idempotentHint }),
    ...(annotations.openWorldHint === undefined ? {} : { openWorld: annotations.openWorldHint })
  }
}
