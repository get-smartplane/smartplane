import { InvalidInput } from "@pc/domain"
import { Effect, Schema } from "effect"
import { allows, type EffectiveAccess } from "../access/resolution"
import type { GatewayTool, ToolProvider } from "../mcp/provider"
import { type McpTool, textResult, type ToolResult } from "../mcp/sdk"
import { SkillContent } from "../skills/serving/content"
import { decodeSkillArgs, getSkill, listSkills, skillToolDefinitions } from "./skill-tools"

const byName = { type: "object", properties: { name: { type: "string" } }, required: ["name"] }

const definitions = {
  ...skillToolDefinitions,
  variables_get: { name: "variables_get", description: "Read a configuration variable you have access to.", inputSchema: byName }
} satisfies Record<string, McpTool>

const NameArgs = Schema.Struct({ name: Schema.NonEmptyString })
const decodeName = (args: unknown) =>
  Schema.decodeUnknownEffect(NameArgs)(args).pipe(Effect.mapError(() => new InvalidInput({ message: "expected { \"name\": string }" })))

const getVariable = (access: EffectiveAccess, name: string): ToolResult => {
  const config = Array.from(access.values(), (grant) => (allows(grant, "read") && grant.resource.name === name ? grant.resource.config : undefined))
    .find((candidate) => candidate?.kind === "variable")
  return config?.kind === "variable" ? textResult(config.value) : textResult("Not found or not permitted.", true)
}

const builtin = (definition: McpTool, prepare: GatewayTool["prepare"]): GatewayTool => ({
  definition,
  target: null,
  operation: definition.name,
  prepare
})

/**
 * Built-in tools read only resources the principal holds `read` on; they reach nothing outside the org.
 * `skills_get` renders arguments while preparing, so a refused argument is a refused call.
 */
export const makeBuiltinProvider = Effect.gen(function*() {
  const content = yield* SkillContent
  const provider: ToolProvider = {
    source: "builtin",
    tools: (scope) =>
      Effect.succeed([
        builtin(definitions.skills_list, () => Effect.succeed({ arguments: {}, execute: listSkills(content, scope) })),
        builtin(definitions.skills_get, (args) =>
          Effect.flatMap(decodeSkillArgs(args), (call) =>
            Effect.map(getSkill(content, scope, call.name, call.arguments), (result) => ({ arguments: call, execute: Effect.succeed(result) })))),
        builtin(definitions.variables_get, (args) =>
          Effect.map(decodeName(args), ({ name }) => ({ arguments: { name }, execute: Effect.sync(() => getVariable(scope.access, name)) })))
      ])
  }
  return provider
})
