import { EnvName } from "@pc/domain"
import { DateTime, Duration, Effect, Option } from "effect"
import { Flag } from "effect/cli"
import { currentSession } from "../api/session"
import { formatTime } from "../app/format"
import { note } from "../app/output"
import { CommaList } from "../app/flag-values"
import { projectScope } from "../config/project-scope"
import { deliver } from "./client"
import { planInjection, refusedNotice } from "./plan"
import type { DeliveryPurpose } from "./schema"

export const deliveryFlags = {
  project: Flag.String("project").pipe(Flag.withDescription("Project slug, name or id (default: .smartplane/project.json)"), Flag.optional),
  only: Flag.String("only").pipe(
    Flag.withSchema(CommaList(EnvName)),
    Flag.withDescription("Only these env names (comma-separated); names that are not delivered are reported"),
    Flag.optional
  ),
  allowMissing: Flag.Boolean("allow-missing").pipe(
    Flag.withDescription("Carry on when a name from --only is unknown or denied (default: exit 2)"),
    Flag.withDefault(false)
  )
}

export interface DeliveryOptions {
  readonly purpose: DeliveryPurpose
  readonly project: Option.Option<string>
  readonly only: Option.Option<ReadonlyArray<EnvName>>
  readonly placeholders: boolean
}

/** Asks the delivery endpoint for values and works out what to inject and what was refused. */
export const fetchDelivery = (options: DeliveryOptions) =>
  Effect.gen(function*() {
    const session = yield* currentSession
    const projectId = yield* projectScope(options.project)
    const names = Option.getOrUndefined(options.only)
    const response = yield* deliver(session, {
      purpose: options.purpose,
      ...(names === undefined ? {} : { names }),
      ...(Option.isSome(projectId) ? { projectId: projectId.value } : {})
    })
    yield* warnIfExpiring(response.expiresAt)
    const plan = planInjection(response, names, options.placeholders)
    if (plan.refused.length > 0) yield* note(refusedNotice(plan.refused))
    return plan
  })

/** `expiresAt` is set for machine tokens; a service whose token lapses fails at its next boot. */
const warnIfExpiring = (expiresAt: DateTime.Utc | null) =>
  Effect.gen(function*() {
    if (expiresAt === null) return
    const left = DateTime.distance(yield* DateTime.now, expiresAt)
    if (Duration.isLessThan(left, Duration.days(7))) {
      yield* note(`smartplane: this machine token expires ${formatTime(expiresAt)}; renew it with \`smartplane machine-tokens renew\`.`)
    }
  })
