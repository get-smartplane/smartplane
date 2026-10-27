import { isBuiltinSlug } from "../skills/builtin/builtin-skills"

const nameOf = (item: unknown): string | undefined =>
  typeof item === "object" && item !== null && "name" in item && typeof item.name === "string" ? item.name : undefined

/**
 * The org's own skills in a listing: built-in skills are served to everyone and covered by their own tests.
 * A built-in's other files are listed as `<slug>/<path>`, so the slug is the part before the first `/`.
 */
export const withoutBuiltins = <A>(list: ReadonlyArray<A>): ReadonlyArray<A> =>
  list.filter((item) => {
    const name = nameOf(item)
    return name === undefined || !isBuiltinSlug(name.split("/")[0] ?? name)
  })
