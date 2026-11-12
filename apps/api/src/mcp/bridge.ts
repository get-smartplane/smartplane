import type { Principal } from "@pc/domain"
import { Cause, Effect, Option } from "effect"
import { McpGateway } from "./gateway"
import { type GatewayHandlers, textResult } from "./sdk"
import type { ToolsMode } from "./search/mode"
import { SkillGateway } from "./skills/skill-gateway"

/** All an agent learns of an unexpected failure: the SDK would otherwise send the raw message (D1/KV text) as is. */
export const InternalErrorText = "Internal error"

/**
 * The SDK's promise-based handlers, bridged into Effect with the request's context (so their spans stay under
 * the request's). An unexpected failure is logged with its cause and answered generically: a tool error for
 * `tools/call`, a JSON-RPC internal error for the rest.
 */
export const gatewayHandlers = (principal: Principal, mode: ToolsMode | undefined) =>
  Effect.gen(function*() {
    const gateway = yield* McpGateway
    const skills = yield* SkillGateway
    const runPromise = Effect.runPromiseWith(yield* Effect.context<never>())

    const run = async <A>(handler: string, effect: Effect.Effect<A>, onFailure?: A): Promise<A> => {
      const outcome = await runPromise(effect.pipe(
        Effect.map(Option.some),
        Effect.catchCause((cause) =>
          Effect.as(Cause.hasInterruptsOnly(cause) ? Effect.void : Effect.logError("MCP handler failed", { handler }, cause), Option.none<A>()))
      ))
      if (Option.isSome(outcome)) return outcome.value
      if (onFailure !== undefined) return onFailure
      throw new Error(InternalErrorText)
    }

    const handlers: GatewayHandlers = {
      listTools: () => run("tools/list", gateway.listTools(principal, mode)),
      callTool: (name, args) => run("tools/call", gateway.callTool(principal, name, args), textResult(InternalErrorText, true)),
      listPrompts: () => run("prompts/list", skills.listPrompts(principal)),
      getPrompt: (name, args) => run("prompts/get", Effect.result(skills.getPrompt(principal, name, args))),
      listResources: () => run("resources/list", skills.listResources(principal)),
      readResource: (uri) => run("resources/read", Effect.result(skills.readResource(principal, uri)))
    }
    return handlers
  })
