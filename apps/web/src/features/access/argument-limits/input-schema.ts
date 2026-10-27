import { ArgumentValue } from "@pc/domain"
import { Option, Schema } from "effect"

/** The few JSON Schema keywords the limits editor reads from an action's input schema; the rest is ignored. */
const PropertySchema = Schema.Struct({
  type: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  title: Schema.optionalKey(Schema.String),
  enum: Schema.optionalKey(Schema.Array(ArgumentValue)),
  items: Schema.optionalKey(Schema.Unknown),
  properties: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown))
})
type PropertySchema = typeof PropertySchema.Type
const decode = Schema.decodeUnknownOption(PropertySchema)

export interface ArgumentInfo {
  readonly path: string
  readonly title: string | null
  readonly valueType: "string" | "number" | "boolean"
  readonly choices: ReadonlyArray<ArgumentValue>
}

const valueTypeOf = (property: PropertySchema): ArgumentInfo["valueType"] => {
  const types = typeof property.type === "string" ? [property.type] : (property.type ?? [])
  return types.includes("number") || types.includes("integer") ? "number" : types.includes("boolean") ? "boolean" : "string"
}

/** For arrays, every element must be allowed, so the element's type and choices are what matter. */
const info = (path: string, property: PropertySchema): ArgumentInfo => {
  const element = property.type === "array" ? Option.getOrElse(decode(property.items), () => property) : property
  return { path, title: property.title ?? null, valueType: valueTypeOf(element), choices: element.enum ?? [] }
}

/** Argument paths an action takes: its top-level inputs, and one level into object inputs. */
export const argumentsOf = (inputSchema: unknown): ReadonlyArray<ArgumentInfo> => {
  const root = Option.getOrUndefined(decode(inputSchema))
  return Object.entries(root?.properties ?? {}).flatMap(([name, raw]) => {
    const property = Option.getOrUndefined(decode(raw))
    if (property === undefined) return []
    const nested = Object.entries(property.properties ?? {}).flatMap(([child, rawChild]) =>
      Option.match(decode(rawChild), { onNone: () => [], onSome: (value) => [info(`${name}.${child}`, value)] })
    )
    return [info(name, property), ...nested]
  })
}
