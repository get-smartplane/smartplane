import { Schema } from "effect"
import { ResourceId, RoleSlug, TeamId, UserId } from "../ids"

const ToolName = Schema.NonEmptyString.check(Schema.isMaxLength(200))

/** Someone a rule is about: a role, a team or one person. */
export const GuardActorRef = Schema.TaggedUnion({
  Role: { role: RoleSlug },
  Team: { teamId: TeamId },
  User: { userId: UserId }
}).annotate({ identifier: "GuardActorRef" })
export type GuardActorRef = typeof GuardActorRef.Type

/**
 * Whose calls a rule checks. `only`: the rule is about these people ("contractors can't push"), so nobody
 * else's calls are checked. `except`: these people are allowed outright ("only finance can send"), so their
 * calls are not checked and everyone else's are.
 */
export const GuardActorFilter = Schema.Struct({
  kind: Schema.Literals(["only", "except"]),
  refs: Schema.NonEmptyArray(GuardActorRef).check(Schema.isMaxLength(20))
}).annotate({ identifier: "GuardActorFilter" })
export type GuardActorFilter = typeof GuardActorFilter.Type

/**
 * The tools of one resource a rule is about, by upstream tool name. `known` is every tool of the resource
 * verify looked at: a tool outside it (one the server added later, or one verify never saw) is never left
 * out by name, only by the operation filter, so a new write tool is still checked.
 */
export const GuardToolScope = Schema.Struct({
  resourceId: ResourceId,
  only: Schema.Array(ToolName).check(Schema.isMaxLength(200)),
  known: Schema.Array(ToolName).check(Schema.isMaxLength(200))
}).annotate({ identifier: "GuardToolScope" })
export type GuardToolScope = typeof GuardToolScope.Type

/** `changes`: only tools that may change something; a tool not marked read-only counts as one. */
export const GuardOperationClass = Schema.Literals(["changes"]).annotate({ identifier: "GuardOperationClass" })
export type GuardOperationClass = typeof GuardOperationClass.Type

/**
 * Which calls a guard is checked on, decided in code before the classifier: a call outside it never reaches
 * Clef for this guard. Verify derives one (`CompiledGuard.applies`) and an admin accepts, edits or clears it
 * (`Guard.applies`); until then only the guard's resource scope narrows it. Every dimension left out matches
 * every call; `resourceIds` empty matches every resource.
 */
export const GuardApplies = Schema.Struct({
  resourceIds: Schema.Array(ResourceId).check(Schema.isMaxLength(50)),
  tools: Schema.optionalKey(Schema.Array(GuardToolScope).check(Schema.isMaxLength(50))),
  operations: Schema.optionalKey(GuardOperationClass),
  actors: Schema.optionalKey(GuardActorFilter)
}).annotate({ identifier: "GuardApplies" })
export type GuardApplies = typeof GuardApplies.Type

/**
 * What personal identities a rule needs to be judged, read when it is verified. `people`: it names
 * specific people, so the classifier sees the caller's email. `accounts`: the account identities it names
 * ("billing@", "ops@acme.com"), lower case; a call's connected account identity is sent only when it is one
 * of them. Without this (rules verified before it existed) the classifier sees both, as it always did.
 */
export const GuardReferences = Schema.Struct({
  people: Schema.Boolean,
  accounts: Schema.Array(Schema.String.check(Schema.isMaxLength(320))).check(Schema.isMaxLength(20))
}).annotate({ identifier: "GuardReferences" })
export type GuardReferences = typeof GuardReferences.Type

const refKey = (ref: GuardActorRef) => (ref._tag === "Role" ? `role:${ref.role}` : ref._tag === "Team" ? `team:${ref.teamId}` : `user:${ref.userId}`)

/** Same filter, ignoring the order of lists. */
export const sameApplies = (a: GuardApplies | null | undefined, b: GuardApplies | null | undefined): boolean => {
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null)
  const set = (values: ReadonlyArray<string>) => [...new Set(values)].sort().join("\n")
  const tools = (scopes: GuardApplies["tools"]) => set((scopes ?? []).map((scope) => `${scope.resourceId}:${set(scope.only)}:${set(scope.known)}`))
  return set(a.resourceIds) === set(b.resourceIds) &&
    tools(a.tools) === tools(b.tools) &&
    a.operations === b.operations &&
    a.actors?.kind === b.actors?.kind &&
    set((a.actors?.refs ?? []).map(refKey)) === set((b.actors?.refs ?? []).map(refKey))
}
