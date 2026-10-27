import { type IntegrationConfigInput, type IntegrationPiece, InvalidInput } from "@pc/domain"
import { Effect, Option } from "effect"
import { IntegrationCatalog } from "./catalog"
import { resolveProps } from "./oauth/connection-props"

const invalid = (message: string, field = "config") => Effect.fail(new InvalidInput({ message, field }))

const checkActions = (piece: IntegrationPiece, actions: IntegrationConfigInput["actions"]) => {
  for (const name of actions ?? []) {
    const action = piece.actions.find((candidate) => candidate.name === name)
    if (action === undefined) return invalid(`${piece.displayName} has no action ${name}`, "config.actions")
    if (action.support.status !== "supported") return invalid(`${piece.displayName}'s ${name} cannot be enabled (${action.support.status})`, "config.actions")
  }
  return Effect.void
}

/** OAuth2 fields are checked when the integration is saved, not first when someone connects it. */
const checkOAuthProps = (piece: IntegrationPiece, connection: IntegrationConfigInput["connection"]) => {
  const auth = piece.auth.find((entry) => entry.type === "oauth2")
  if (connection.type !== "oauth2" || auth?.type !== "oauth2") return Effect.void
  const resolved = resolveProps(auth.fields, connection.props ?? {})
  return "invalid" in resolved ? invalid(resolved.invalid, "config.connection.props") : Effect.void
}

/**
 * An integration must name a bundled piece, connect with a method that piece accepts (OAuth2 fields
 * included), and allow-list only actions the gateway can run. Referenced secrets are checked separately,
 * like every other resource.
 */
export const checkIntegrationConfig = (input: IntegrationConfigInput): Effect.Effect<void, InvalidInput, IntegrationCatalog> =>
  Effect.gen(function*() {
    const catalog = yield* IntegrationCatalog
    const piece = catalog.piece(input.pieceId)
    if (Option.isNone(piece)) return yield* invalid(`no bundled integration named ${input.pieceId}`, "config.pieceId")
    const accepted = piece.value.authTypes
    if (!accepted.includes(input.connection.type)) {
      return yield* invalid(`${piece.value.displayName} connects with ${accepted.join(" or ")}, not ${input.connection.type}`, "config.connection")
    }
    yield* checkOAuthProps(piece.value, input.connection)
    yield* checkActions(piece.value, input.actions)
  })
