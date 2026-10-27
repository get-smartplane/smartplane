/** `{field}` or `{{field}}`, as Activepieces pieces write placeholders. */
const placeholder = /\{\{?\s*([\w-]+)\s*\}?\}/g

const substitute = (template: string, props: Readonly<Record<string, string>>, encode: (value: string) => string) => {
  let missing: string | undefined
  const text = template.replace(placeholder, (_match, name: string) => {
    const value = props[name]
    if (value === undefined || value === "") missing ??= name
    return encode(value ?? "")
  })
  return { text, missing }
}

/**
 * Fills an endpoint's placeholders (a Zendesk subdomain, a Microsoft cloud and tenant) from the connection's
 * props. Values are URL-encoded, so a value cannot add a path, query, port or userinfo to the host.
 */
export const fillTemplate = (template: string, props: Readonly<Record<string, string>>): { readonly url: string } | { readonly missing: string } => {
  const { text, missing } = substitute(template, props, encodeURIComponent)
  return missing === undefined ? { url: text } : { missing }
}

/**
 * Fills placeholders in scopes (Outlook's `{accessMode}`, Dynamics' `{hostUrl}/.default`). A value may hold
 * several space-separated scopes; the result is the distinct scopes in order.
 */
export const fillScopes = (scopes: ReadonlyArray<string>, props: Readonly<Record<string, string>>): { readonly scopes: ReadonlyArray<string> } | { readonly missing: string } => {
  const filled = scopes.map((scope) => substitute(scope, props, (value) => value))
  const missing = filled.find((scope) => scope.missing !== undefined)?.missing
  return missing === undefined ? { scopes: [...new Set(filled.flatMap(({ text }) => text.split(/\s+/).filter((scope) => scope !== "")))] } : { missing }
}
