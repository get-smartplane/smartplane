import { InvalidInput } from "@pc/domain"
import { Effect, JsonSchema, Schema, SchemaRepresentation } from "effect"
import { customApiCallInputError } from "./actions/custom-api-call"
import type { JsonObject } from "./json"

/** Validated arguments: JSON, so they can be audited, classified by guards and sent over RPC as they are. */
export type ActionInput = Schema.JsonObject
const isJsonObject = Schema.is(Schema.JsonObject)
export type InputValidator = (input: unknown) => Effect.Effect<ActionInput, InvalidInput>

/**
 * Compiles a catalog input schema into an Effect Schema decoder. Throws when the JSON Schema uses features
 * the importer does not support; the catalog generator compiles every action, so a shipped catalog never does.
 */
export const compileInputSchema = (inputSchema: JsonObject): Schema.Codec<unknown> =>
  // Imported JSON Schemas are built from the importer's own checks, which need no services.
  Schema.make<Schema.Codec<unknown>>(SchemaRepresentation.fromJsonSchemaDocument(JsonSchema.fromSchemaDraft2020_12({ ...inputSchema })).ast)

/**
 * Validates an agent's arguments against an action's input schema, then applies the action-specific rules
 * the schema cannot express (a `custom_api_call` URL must stay relative). Unknown keys are rejected, not dropped.
 */
export const makeInputValidator = (actionName: string, inputSchema: JsonObject): InputValidator => {
  const schema = compileInputSchema(inputSchema)
  const decode = Schema.decodeUnknownEffect(schema)
  const checked = (value: unknown): Effect.Effect<ActionInput, InvalidInput> => {
    if (!isJsonObject(value)) return Effect.fail(new InvalidInput({ message: "expected a JSON object" }))
    const refused = customApiCallInputError(actionName, value)
    return refused === null ? Effect.succeed(value) : Effect.fail(refused)
  }
  return (input) =>
    decode(input, { onExcessProperty: "error", errors: "all" }).pipe(
      Effect.mapError((error) => new InvalidInput({ message: error.message })),
      Effect.flatMap(checked)
    )
}

const validators = new Map<string, InputValidator>()

/** One compiled validator per piece action, built on first use. */
export const cachedValidator = (pieceId: string, actionName: string, inputSchema: JsonObject): InputValidator => {
  const key = `${pieceId}/${actionName}`
  const existing = validators.get(key)
  if (existing !== undefined) return existing
  const created = makeInputValidator(actionName, inputSchema)
  validators.set(key, created)
  return created
}
