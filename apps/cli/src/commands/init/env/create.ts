import { envNameOf, type Me, type ProjectId, type Resource } from "@pc/domain"
import { Effect, Redacted } from "effect"
import type { Api } from "../../../api/client"
import { type AppError, toFailure } from "../../../app/describe-error"
import type { ValueKind } from "./classify"

/** One name from a dotenv file on its way into Smartplane. The value stays redacted until it is sent. */
export interface Candidate {
  readonly name: string
  readonly value: Redacted.Redacted<string>
  readonly kind: ValueKind
  readonly reason: string
  readonly file: string
}

export type Created = { readonly _tag: "Created"; readonly name: string; readonly kind: ValueKind; readonly deliverable: boolean; readonly granted: boolean }
export type Skipped = { readonly _tag: "Skipped"; readonly name: string; readonly reason: string }

/**
 * Names that would clash: resource names anywhere in the org (they are unique), and the env names of
 * secrets and variables delivered in the same scope (org-wide, or the chosen project).
 */
export const takenNames = (resources: ReadonlyArray<Resource>, projectId: ProjectId | null) => {
  const names = new Set(resources.map((resource) => resource.name.toLowerCase()))
  const envNames = new Set(
    resources
      .filter((resource) => (resource.config.kind === "secret" || resource.config.kind === "variable") && (resource.projectId === null || resource.projectId === projectId))
      .flatMap((resource) => envNameOf(resource) ?? [])
  )
  return (name: string) => names.has(name.toLowerCase()) || envNames.has(name)
}

/** Schema errors can quote the value they rejected, so they are reported without their message. */
const describe = (error: AppError) => (error._tag === "SchemaError" ? "the value does not fit Smartplane's limits" : toFailure(error).message)

/**
 * Creates the secret or variable under its env name. A deliverable secret is switched with the delivery PATCH
 * and, when the caller may grant, gets a `use` grant for them: creators get no grant on secrets otherwise.
 */
export const createImported = (client: Api, me: Me, projectId: ProjectId | null, candidate: Candidate, deliverable: boolean) =>
  Effect.gen(function*() {
    const description = `Imported from ${candidate.file} by smartplane init`
    const config = candidate.kind === "secret"
      ? { kind: "secret" as const, value: candidate.value }
      : { kind: "variable" as const, value: Redacted.value(candidate.value), envName: candidate.name }
    const created = yield* Effect.result(client.resources.create({ payload: { name: candidate.name, description, projectId, config } }))
    if (created._tag === "Failure") {
      const reason = created.failure._tag === "Conflict" ? "already in Smartplane" : describe(created.failure)
      return { _tag: "Skipped", name: candidate.name, reason } satisfies Skipped
    }
    if (candidate.kind === "variable" || !deliverable) {
      return { _tag: "Created", name: candidate.name, kind: candidate.kind, deliverable: candidate.kind === "variable", granted: candidate.kind === "variable" } satisfies Created
    }
    const id = created.success.id
    const switched = yield* Effect.result(client.resourceDelivery.update({ params: { id }, payload: { delivery: "deliverable", envName: candidate.name } }))
    const grantee = me.principal._tag === "User" && me.principal.permissions.includes("grants:manage") ? me.principal.userId : undefined
    const grant = (userId: NonNullable<typeof grantee>) =>
      client.grants.create({ payload: { subject: { type: "user", id: userId }, resourceId: id, action: "use", conditions: {}, expiresAt: null } })
    const granted = switched._tag === "Success" && grantee !== undefined && (yield* Effect.result(grant(grantee)))._tag === "Success"
    return { _tag: "Created", name: candidate.name, kind: "secret", deliverable: switched._tag === "Success", granted } satisfies Created
  })
