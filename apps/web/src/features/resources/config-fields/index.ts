import type { ResourceKind } from "@pc/domain"
import type { ComponentType } from "react"
import type { ConfigFieldsProps } from "../config-draft"
import { ApiAdvanced, ApiFields } from "./api-fields"
import { DatabaseAdvanced, DatabaseFields } from "./database-fields"
import { IntegrationAdvanced } from "./integration-advanced"
import { IntegrationFields } from "./integration-fields"
import { McpServerAdvanced, McpServerFields } from "./mcp-server-fields"
import { SecretFields } from "./secret-fields"
import { SkillAdvanced } from "./skill-arguments-field"
import { SkillFields } from "./skill-fields"
import { ToolFields } from "./tool-fields"
import { VariableFields } from "./variable-fields"

interface KindFields {
  /** What the kind cannot work without. */
  readonly Essential: ComponentType<ConfigFieldsProps>
  /** Everything with a sensible default, folded under "Advanced". */
  readonly Advanced?: ComponentType<ConfigFieldsProps>
}

/** One field set per `ResourceConfig` case; the create form swaps them by kind. */
export const configFields: { readonly [K in ResourceKind]: KindFields } = {
  mcp_server: { Essential: McpServerFields, Advanced: McpServerAdvanced },
  tool: { Essential: ToolFields },
  skill: { Essential: SkillFields, Advanced: SkillAdvanced },
  database: { Essential: DatabaseFields, Advanced: DatabaseAdvanced },
  api: { Essential: ApiFields, Advanced: ApiAdvanced },
  integration: { Essential: IntegrationFields, Advanced: IntegrationAdvanced },
  secret: { Essential: SecretFields },
  variable: { Essential: VariableFields }
}
