import { Schema } from "effect"
import { isPrimitive, type Json, type JsonObject, toJson } from "../json"
import { type PieceProp, StaticOptions } from "../piece-shape"

/** How one Activepieces prop appears to an agent: as a JSON Schema, left out, or blocking the action. */
type Field =
  | { readonly kind: "input"; readonly schema: JsonObject; readonly dynamic: boolean }
  | { readonly kind: "omit" }
  | { readonly kind: "block"; readonly reason: string }

export interface ConvertedProps {
  /** JSON Schema (draft 2020-12) of the action input. */
  readonly inputSchema: JsonObject
  /** Inputs whose choices Activepieces resolves live; agents pass raw values. */
  readonly dynamicInputs: ReadonlyArray<string>
  /** Why the action cannot run from an agent call, or `null`. */
  readonly blocked: string | null
}

const isStaticOptions = Schema.is(StaticOptions)

const describe = (prop: PieceProp, note?: string): JsonObject => {
  const description = [prop.description ?? "", note ?? ""].map((part) => part.trim()).filter((part) => part !== "").join(" ")
  return { ...(prop.displayName ? { title: prop.displayName } : {}), ...(description ? { description } : {}) }
}

/** An `enum` when every choice is a JSON primitive; otherwise the choices are listed in the description. */
const choices = (prop: PieceProp): JsonObject => {
  const options = isStaticOptions(prop.options) ? prop.options.options : []
  const values = options.map((option) => option.value)
  if (values.length > 0 && values.every(isPrimitive)) {
    return values.every((value) => typeof value === "string") ? { type: "string", enum: values } : { enum: values }
  }
  const listed = options.map((option) => `${option.label} = ${JSON.stringify(toJson(option.value) ?? null)}`).join("; ")
  return listed === "" ? {} : { description: `Choices: ${listed}.` }
}

const dynamicNote = (prop: PieceProp) =>
  `Activepieces resolves the choices live${prop.refreshers?.length ? ` (from ${prop.refreshers.join(", ")})` : ""}; pass the option's value, usually an id.`

const input = (schema: JsonObject, dynamic = false): Field => ({ kind: "input", schema, dynamic })

const unusable = (prop: PieceProp, reason: string): Field => (prop.required === true ? { kind: "block", reason } : { kind: "omit" })

const fieldOf = (name: string, prop: PieceProp): Field => {
  switch (prop.type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "RICH_TEXT":
    case "COLOR":
    case "SECRET_TEXT":
      return input({ type: "string", ...describe(prop) })
    case "NUMBER":
      return input({ type: "number", ...describe(prop) })
    case "CHECKBOX":
      return input({ type: "boolean", ...describe(prop) })
    case "DATE_TIME":
      return input({ type: "string", format: "date-time", ...describe(prop, "ISO 8601 date-time.") })
    case "STATIC_DROPDOWN":
      return input({ ...choices(prop), ...describe(prop) })
    case "STATIC_MULTI_SELECT_DROPDOWN":
      return input({ type: "array", items: choices(prop), ...describe(prop) })
    case "DROPDOWN":
      return input(describe(prop, dynamicNote(prop)), true)
    case "MULTI_SELECT_DROPDOWN":
      return input({ type: "array", ...describe(prop, dynamicNote(prop)) }, true)
    case "DYNAMIC":
      return input({ type: "object", ...describe(prop, `Its fields depend on ${prop.refreshers?.join(", ") || "other inputs"}.`) }, true)
    case "OBJECT":
      return input({ type: "object", ...describe(prop) })
    case "JSON":
      return input(describe(prop, "Any JSON value."))
    case "ARRAY":
      return arrayField(name, prop)
    case "MARKDOWN":
      return { kind: "omit" }
    case "FILE":
      return unusable(prop, `input "${name}" is a file, which agents cannot send yet`)
    default:
      return unusable(prop, `input "${name}" has unsupported type ${prop.type}`)
  }
}

/** Items are objects when the prop declares item fields, otherwise text. */
const arrayField = (name: string, prop: PieceProp): Field => {
  if (prop.properties === undefined) return input({ type: "array", items: { type: "string" }, ...describe(prop) })
  const items = convertProps(prop.properties)
  if (items.blocked !== null) return unusable(prop, `input "${name}": ${items.blocked}`)
  return input({ type: "array", items: items.inputSchema, ...describe(prop) }, items.dynamicInputs.length > 0)
}

const withDefault = (schema: JsonObject, prop: PieceProp): JsonObject => {
  const value: Json | undefined = prop.defaultValue === undefined ? undefined : toJson(prop.defaultValue)
  return value === undefined ? schema : { ...schema, default: value }
}

/** Converts a piece action's props into the JSON Schema agents see. Pure; see `docs/integrations.md`. */
export const convertProps = (props: Readonly<Record<string, PieceProp>>): ConvertedProps => {
  const properties: Record<string, Json> = {}
  const required: Array<string> = []
  const dynamicInputs: Array<string> = []
  for (const [name, prop] of Object.entries(props)) {
    const field = fieldOf(name, prop)
    if (field.kind === "block") return { inputSchema: { type: "object" }, dynamicInputs: [], blocked: field.reason }
    if (field.kind === "omit") continue
    properties[name] = withDefault(field.schema, prop)
    if (prop.required === true) required.push(name)
    if (field.dynamic) dynamicInputs.push(name)
  }
  const inputSchema: JsonObject = {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false
  }
  return { inputSchema, dynamicInputs, blocked: null }
}
