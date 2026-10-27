import { Command } from "effect/cli"
import { addResource } from "./add"
import { listResources } from "./list"
import { removeResource } from "./remove"

export const resources = Command.make("resources").pipe(
  Command.withDescription("Manage what agents can reach: MCP servers, tools, skills, databases, APIs, integrations, secrets, variables"),
  Command.withSubcommands([listResources, addResource, removeResource])
)
