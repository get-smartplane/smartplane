import { Schema } from "effect"
import { ActionName } from "./names"

/** What an action does to the connected system, as classified by its piece. */
export const ActionClassification = Schema.Literals(["read", "search", "write", "destructive"])
export type ActionClassification = typeof ActionClassification.Type

/** Who the piece author built the action for; `ai` variants have flatter, agent-friendly inputs. */
export const ActionAudience = Schema.Literals(["ai", "human", "both"])
export type ActionAudience = typeof ActionAudience.Type

/**
 * Whether the gateway can run the action. `superseded` hides a classic action whose agent-oriented
 * variant (`by`) does the same thing; `unsupported` explains what the runtime cannot provide.
 */
export const ActionSupport = Schema.Union([
  Schema.Struct({ status: Schema.tag("supported") }),
  Schema.Struct({ status: Schema.tag("superseded"), by: ActionName }),
  Schema.Struct({ status: Schema.tag("unsupported"), reason: Schema.String })
]).annotate({ identifier: "ActionSupport" })
export type ActionSupport = typeof ActionSupport.Type

/** The grant action an integration action needs. */
export const IntegrationGrantAction = Schema.Literals(["use", "write"])
export type IntegrationGrantAction = typeof IntegrationGrantAction.Type

/**
 * Reading and searching need `use`; anything else (writes, deletes, or an action its piece left
 * unclassified) needs `write`. Unclassified fails safe.
 */
export const requiredGrantAction = (classification: ActionClassification | null): IntegrationGrantAction =>
  classification === "read" || classification === "search" ? "use" : "write"

export const IntegrationAction = Schema.Struct({
  name: ActionName,
  displayName: Schema.String,
  description: Schema.String,
  audience: Schema.NullOr(ActionAudience),
  classification: Schema.NullOr(ActionClassification),
  /** Safe to retry with the same input, when the piece says so. */
  idempotent: Schema.NullOr(Schema.Boolean),
  requiredAction: IntegrationGrantAction,
  /** JSON Schema (draft 2020-12) of the action's input, as shown to agents. */
  inputSchema: Schema.JsonObject,
  /** Inputs whose choices Activepieces resolves live (dropdowns); agents pass the raw id or value instead. */
  dynamicInputs: Schema.Array(Schema.String),
  support: ActionSupport
}).annotate({ identifier: "IntegrationAction" })
export type IntegrationAction = typeof IntegrationAction.Type

export const isSupported = (action: IntegrationAction): boolean => action.support.status === "supported"
