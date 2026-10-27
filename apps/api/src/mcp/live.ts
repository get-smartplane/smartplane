import { Layer } from "effect"
import { ToolProvidersLive } from "../gateway-tools/live"
import { ToolCatalog } from "./catalog"
import { McpGateway } from "./gateway"
import { ToolPipeline } from "./pipeline"
import { ToolSearchSettings } from "./search/mode"
import { SkillGateway } from "./skills/skill-gateway"

/** The gateway with its catalog, call pipeline and every live tool provider, plus skills as prompts and resources. */
export const McpGatewayLive = Layer.mergeAll(
  McpGateway.layer.pipe(Layer.provide(Layer.mergeAll(ToolCatalog.layer.pipe(Layer.provide(ToolProvidersLive)), ToolPipeline.layer, ToolSearchSettings.layer))),
  SkillGateway.layer
)
