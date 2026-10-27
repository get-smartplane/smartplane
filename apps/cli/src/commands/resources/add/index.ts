import { Command } from "effect/cli"
import { addApi, addMcpServer, addTool } from "./connections"
import { addDatabase, addSecret, addSkill, addVariable } from "./data"
import { addIntegration } from "./integration"

export const addResource = Command.make("add").pipe(
  Command.withDescription("Add a resource; one subcommand per kind"),
  Command.withSubcommands([addMcpServer, addTool, addSkill, addDatabase, addApi, addIntegration, addSecret, addVariable])
)
