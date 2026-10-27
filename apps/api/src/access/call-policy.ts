import { type Action, actionImplies, type ArgumentValue, type DenyReason, type GrantConditions, type ResourceId } from "@pc/domain"

/** One contributing grant's action and conditions; a call is allowed when a single grant covers all of it. */
export interface GrantTerms {
  readonly action: Action
  readonly conditions: GrantConditions
}

const valueAt = (args: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((current, key) =>
    typeof current === "object" && current !== null && !Array.isArray(current) && Object.hasOwn(current, key)
      ? Reflect.get(current, key)
      : undefined, args)

const allowed = (values: ReadonlyArray<ArgumentValue>, value: unknown): boolean =>
  Array.isArray(value)
    ? value.length > 0 && value.every((item) => allowed(values, item))
    : (typeof value === "string" || typeof value === "number" || typeof value === "boolean") && values.includes(value)

/**
 * The first argument path whose value the constraints do not allow, or `null` when every path matches.
 * Fails closed: a missing value or one of the wrong type does not match.
 */
export const argumentMismatch = (
  constraints: Readonly<Record<string, ReadonlyArray<ArgumentValue>>> | undefined,
  args: unknown
): string | null => {
  for (const [path, values] of Object.entries(constraints ?? {})) {
    if (!allowed(values, valueAt(args, path))) return path
  }
  return null
}

/**
 * Why calling `tool` (needing `required`) under these grant terms is refused, or `[]`. Grants stay additive
 * but are not mixed: one grant must imply the action, list the tool (or list none) and accept the arguments.
 * Without `args` (listing tools), argument constraints are not checked yet.
 */
export const termsDenials = (
  terms: ReadonlyArray<GrantTerms>,
  resourceId: ResourceId,
  tool: string,
  required: Action,
  args?: unknown
): ReadonlyArray<DenyReason> => {
  if (terms.length === 0) return [{ _tag: "NoGrant", resourceId }]
  const acting = terms.filter((term) => actionImplies(term.action, required))
  if (acting.length === 0) return [{ _tag: "ActionNotGranted", resourceId, required }]
  const listing = acting.filter(({ conditions }) => conditions.tools === undefined || conditions.tools.includes(tool))
  if (listing.length === 0) return [{ _tag: "ToolNotAllowed", resourceId, tool }]
  if (args === undefined) return []
  const mismatches = listing.map(({ conditions }) => argumentMismatch(conditions.arguments?.[tool], args))
  const firstMismatch = mismatches.find((path) => path !== null)
  return firstMismatch === undefined || mismatches.includes(null) ? [] : [{ _tag: "ArgumentNotAllowed", resourceId, tool, path: firstMismatch }]
}
