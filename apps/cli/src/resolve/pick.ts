import { Effect } from "effect"
import { type CliFailure, failure } from "../app/failure"

/** How to recognise one entity kind: its id, the names people type, and how to show it in an error. */
export interface Naming<A, I extends string = string> {
  readonly entity: string
  readonly id: (item: A) => I
  readonly names: (item: A) => ReadonlyArray<string | null>
  readonly label: (item: A) => string
}

const listed = <A, I extends string>(naming: Naming<A, I>, items: ReadonlyArray<A>) =>
  items.slice(0, 8).map((item) => `  ${naming.label(item)}  ${naming.id(item)}`).join("\n")

const matching = <A, I extends string>(naming: Naming<A, I>, items: ReadonlyArray<A>, same: (name: string) => boolean) =>
  items.filter((item) => naming.names(item).some((name) => name !== null && same(name)))

/**
 * Finds the one item `query` names: an exact id, else an exact name, else a case-insensitive name. More than
 * one match is an error that lists the candidates, so a script never acts on the wrong thing.
 */
export const pick = <A, I extends string>(naming: Naming<A, I>, query: string, items: ReadonlyArray<A>): Effect.Effect<A, CliFailure> => {
  const byId = items.find((item) => naming.id(item) === query)
  if (byId !== undefined) return Effect.succeed(byId)
  const lower = query.toLowerCase()
  for (const same of [(name: string) => name === query, (name: string) => name.toLowerCase() === lower]) {
    const found = matching(naming, items, same)
    if (found.length === 1 && found[0] !== undefined) return Effect.succeed(found[0])
    if (found.length > 1) {
      return Effect.fail(failure(`"${query}" matches ${found.length} ${naming.entity}s:\n${listed(naming, found)}`, "Pass the id instead."))
    }
  }
  const similar = matching(naming, items, (name) => name.toLowerCase().includes(lower))
  return Effect.fail(
    failure(`No ${naming.entity} named "${query}".`, similar.length > 0 ? `Did you mean:\n${listed(naming, similar)}` : undefined)
  )
}
