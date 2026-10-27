import { Cause, Exit, Option, Schema, SchemaIssue } from "effect"

export type FieldErrors = Readonly<Partial<Record<string, string>>>

export type FormResult<A> =
  | { readonly _tag: "Valid"; readonly value: A }
  | { readonly _tag: "Invalid"; readonly errors: FieldErrors }

const formatter = SchemaIssue.makeFormatterStandardSchemaV1()

type Path = ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined

/** `["config", "value", "value"]` → `["config", "config.value", "config.value.value"]` (plus `""` for the root). */
const pathPrefixes = (path: Path): ReadonlyArray<string> => {
  const segments = (path ?? []).map((segment) => String(typeof segment === "object" ? segment.key : segment))
  return segments.map((_, index) => segments.slice(0, index + 1).join(".")).concat(segments.length === 0 ? [""] : [])
}

/**
 * Decodes form input with a domain schema and flattens every issue to `{ "field.path": message }`.
 * An issue is also recorded under each ancestor path, so a control bound to `config.value` shows
 * errors from inside it (e.g. a Redacted's inner string). `messages` replaces the schema's
 * technical wording with copy for a given path.
 */
export const decodeForm = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  messages: Readonly<Record<string, string>> = {}
) => {
  const decode = Schema.decodeUnknownExit(schema, { errors: "all" })
  return (input: unknown): FormResult<S["Type"]> => {
    const exit = decode(input)
    if (Exit.isSuccess(exit)) return { _tag: "Valid", value: exit.value }
    const errors: Record<string, string> = {}
    const error = Cause.findErrorOption(exit.cause)
    const issues = Option.isSome(error) ? formatter(error.value.issue).issues : []
    for (const issue of issues) {
      for (const key of pathPrefixes(issue.path)) errors[key] ??= messages[key] ?? issue.message
    }
    return { _tag: "Invalid", errors }
  }
}
