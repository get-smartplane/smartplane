import type { Resource, ResourceConfig } from "@pc/domain"
import { formatList, formatTime } from "../../app/format"
import { details, tableOr } from "../../app/table"
import { kindLabel } from "./kinds"

/** The one line that says what a resource points at; never a secret value. */
export const configSummary = (config: ResourceConfig): string => {
  switch (config.kind) {
    case "mcp_server":
      return `${config.url} (${config.transport === "sse" ? "sse" : "http"})`
    case "tool":
      return `${config.toolName} on ${config.serverId}`
    case "skill":
      return config.description
    case "database":
      return `${config.engine}${config.readOnly ? ", read-only" : ", read-write"}`
    case "api":
      return `${config.baseUrl} [${formatList(config.allowedMethods ?? ["GET"])}]`
    case "integration":
      return `${config.pieceId} via ${config.connection.type}${config.connection.type === "oauth2" ? ` (${config.connection.status})` : ""}`
    case "secret":
      return "encrypted"
    case "variable":
      return config.value
  }
}

export const resourceTable = (resources: ReadonlyArray<Resource>) =>
  tableOr(
    "No resources.",
    ["name", "kind", "id", "scope", "target"],
    resources.map((r) => [r.name, kindLabel(r.config.kind), r.id, r.projectId ?? "org", configSummary(r.config)])
  )

export const resourceDetails = (resource: Resource) =>
  details([
    ["name", resource.name],
    ["kind", kindLabel(resource.config.kind)],
    ["id", resource.id],
    ["scope", resource.projectId ?? "org"],
    ["target", configSummary(resource.config)],
    ["description", resource.description],
    ["created", formatTime(resource.createdAt)]
  ])
