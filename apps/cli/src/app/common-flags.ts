import { Option } from "effect"
import { Flag } from "effect/cli"

export const yesFlag = Flag.Boolean("yes").pipe(
  Flag.withAlias("y"),
  Flag.withDescription("Do not ask for confirmation"),
  Flag.withDefault(false)
)

export const projectFlag = Flag.String("project").pipe(Flag.withDescription("Project slug, name or id"), Flag.optional)

/** `{ key: value }` when the option is set, `{}` otherwise: for optional query and payload keys. */
export const field = <const K extends string, A>(key: K, option: Option.Option<A>): { readonly [P in K]?: A } =>
  Option.match(option, { onNone: () => ({}), onSome: (value) => ({ [key]: value }) as { readonly [P in K]: A } })
