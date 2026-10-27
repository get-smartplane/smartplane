import type { AuthField } from "@pc/domain"

/**
 * A connection's OAuth2 field values as endpoint templates and pieces use them: the piece's default fills a
 * blank field (Microsoft's `cloud` and `tenant`), a select takes only one of its options (a cloud picks the
 * sign-in host, so it must be one the piece knows), and a required field must end up with a value.
 */
export const resolveProps = (
  fields: ReadonlyArray<AuthField>,
  given: Readonly<Record<string, string>>
): { readonly props: Readonly<Record<string, string>> } | { readonly invalid: string } => {
  const props: Record<string, string> = { ...given }
  for (const field of fields) {
    const value = Object.hasOwn(given, field.name) && given[field.name] !== "" ? given[field.name] : field.defaultValue
    if (value === undefined) {
      if (field.required) return { invalid: `the connection needs the "${field.name}" field` }
      continue
    }
    if (field.options !== undefined && !field.options.some((option) => option.value === value)) {
      return { invalid: `"${field.name}" must be one of ${field.options.map((option) => option.value).join(", ")}` }
    }
    props[field.name] = value
  }
  return { props }
}
