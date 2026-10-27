import { ActionAudience, ActionClassification, ActionName, type ActionSupport, type IntegrationAction, type IntegrationPiece, PieceId, requiredGrantAction } from "@pc/domain"
import { Option, Schema } from "effect"
import { unavailableReason } from "./actions/context-use"
import { CustomApiCallAction, customApiCallUrlSchema } from "./actions/custom-api-call"
import { supersededBy } from "./actions/supersede"
import { convertAuth } from "./auth/convert"
import type { CuratedPiece } from "./curation"
import type { JsonObject } from "./json"
import { actionsOf, type PieceAction, type PieceDefinition } from "./piece-shape"
import { convertProps } from "./props/convert"

const asClassification = Schema.decodeUnknownOption(ActionClassification)
const asAudience = Schema.decodeUnknownOption(ActionAudience)
const isActionName = Schema.is(ActionName)

const lower = (value: string | null | undefined) => (typeof value === "string" ? value.toLowerCase() : undefined)

const supportOf = (action: PieceAction, blocked: string | null, replacement: string | undefined): ActionSupport => {
  const unavailable = unavailableReason(action.run.toString())
  if (blocked !== null) return { status: "unsupported", reason: `Not runnable by agents: ${blocked}.` }
  if (unavailable !== null) return { status: "unsupported", reason: `Needs Activepieces itself: ${unavailable}.` }
  if (replacement !== undefined) return { status: "superseded", by: replacement }
  return { status: "supported" }
}

/**
 * The generic Custom API Call's `url` is a dynamic prop whose only field is the URL; the catalog types it so
 * agents can fill it in, and says that only a provider-relative path is accepted (enforced by the validator).
 */
const patchCustomApiCall = (action: PieceAction, inputSchema: JsonObject): JsonObject => {
  const properties = inputSchema.properties
  if (action.name !== CustomApiCallAction || typeof properties !== "object" || properties === null || Array.isArray(properties)) return inputSchema
  return { ...inputSchema, properties: { ...properties, url: customApiCallUrlSchema } }
}

/** One piece as catalog data. Pure apart from reading each action's `run` source. */
export const describePiece = (curated: CuratedPiece, version: string, piece: PieceDefinition): IntegrationPiece => {
  const pieceActions = Array.from(actionsOf(piece).values()).filter((action) => isActionName(action.name))
  const listed = pieceActions.map((action) => ({
    action,
    audience: Option.getOrNull(asAudience(action.audience)),
    classification: Option.getOrNull(asClassification(lower(action.classification)))
  }))
  const hidden = supersededBy(listed.map(({ action, audience }) => ({ name: action.name, displayName: action.displayName, audience })))
  const actions = listed.map(({ action, audience, classification }): IntegrationAction => {
    const { inputSchema: converted, dynamicInputs, blocked } = convertProps(action.props)
    const inputSchema = patchCustomApiCall(action, converted)
    return {
      name: action.name,
      displayName: action.displayName,
      description: action.description,
      audience,
      classification,
      idempotent: action.aiMetadata?.idempotent ?? null,
      requiredAction: requiredGrantAction(classification),
      inputSchema,
      dynamicInputs,
      support: supportOf(action, blocked, hidden.get(action.name))
    }
  })
  const auth = convertAuth(piece.auth)
  const extraScopes = curated.extraScopes ?? []
  return {
    id: PieceId.make(curated.id),
    displayName: piece.displayName,
    description: piece.description ?? "",
    logoUrl: piece.logoUrl,
    categories: piece.categories ?? [],
    version,
    authTypes: auth.authTypes,
    actionCount: actions.length,
    supportedActionCount: actions.filter((action) => action.support.status === "supported").length,
    packageName: curated.packageName,
    shard: curated.shard,
    auth: auth.auth.map((entry) => (entry.type === "oauth2" ? { ...entry, scopes: [...new Set([...entry.scopes, ...extraScopes])] } : entry)),
    actions
  }
}
