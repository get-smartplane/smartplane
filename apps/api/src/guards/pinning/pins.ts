import { type ConfirmGuardPin, Conflict, type Forbidden, type Guard, type GuardId, type GuardPin, type GuardPinStats, NotFound, type Principal } from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { AuditLog } from "../../audit/audit-log"
import { requirePermission, requireUser } from "../../auth/permissions"
import { GuardsRepo } from "../guards-repo"
import { VerifyRuns } from "../verify-job/runs"
import { PinChildren } from "./children-store"

const pinId = () => `pin_${Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("")}`

/** What the audit trail keeps of a pin: ids, label and kind, as the admin saw them. */
const audited = (pin: GuardPin) => ({ id: pin.id, resourceId: pin.resourceId, entityId: pin.entityId, label: pin.label, kind: pin.kind })

/**
 * Confirming, dismissing and removing pins. A pin is only ever one of the candidates verify's lookup showed
 * the admin; it adds context for the classifier and changes nothing else, so the rule keeps its status. A
 * verify run waiting at `needs_confirmation` resumes testing once the admin confirms or dismisses.
 */
export class GuardPins extends Context.Service<GuardPins, {
  readonly confirm: (principal: Principal, id: GuardId, input: ConfirmGuardPin) => Effect.Effect<Guard, Forbidden | NotFound | Conflict>
  readonly dismiss: (principal: Principal, id: GuardId) => Effect.Effect<Guard, Forbidden | NotFound | Conflict>
  readonly unpin: (principal: Principal, id: GuardId, pinId: string) => Effect.Effect<Guard, Forbidden | NotFound>
  readonly stats: (principal: Principal, id: GuardId) => Effect.Effect<ReadonlyArray<GuardPinStats>, Forbidden | NotFound>
}>()("api/guards/GuardPins") {
  static readonly layer = Layer.effect(
    GuardPins,
    Effect.gen(function*() {
      const guards = yield* GuardsRepo
      const children = yield* PinChildren
      const audit = yield* AuditLog
      const runs = yield* VerifyRuns
      // A run paused for this decision goes on testing; if it cannot be queued the run says so, the pin stands.
      const resumed = (guard: Guard) => runs.resume(guard).pipe(Effect.orElseSucceed(() => guard))

      const load = (principal: Principal, id: GuardId) =>
        guards.find(principal.orgId, id).pipe(Effect.flatMap(Effect.fromOption), Effect.mapError(() => new NotFound({ entity: "guard", id })))

      const confirm = Effect.fn("GuardPins.confirm")(function*(principal: Principal, id: GuardId, input: ConfirmGuardPin) {
        yield* requirePermission(principal, "guards:manage")
        const user = yield* requireUser(principal)
        const guard = yield* load(principal, id)
        const candidate = guard.compiled?.pinning?.candidates.find((c) => c.resourceId === input.resourceId && c.entityId === input.entityId)
        if (candidate === undefined) return yield* new Conflict({ message: "pin one of the candidates the lookup found; verify again to look it up" })
        if (guard.pins.some((pin) => pin.resourceId === candidate.resourceId && pin.entityId === candidate.entityId)) return guard
        const pin: GuardPin = { id: pinId(), ...candidate, pinnedBy: user.userId, pinnedAt: yield* DateTime.now }
        const next: Guard = { ...guard, pins: [...guard.pins, pin], updatedAt: yield* DateTime.now }
        yield* guards.save(next)
        yield* audit.by(principal, "guard.updated", { type: "guard", id }, { pinAdded: audited(pin) })
        return yield* resumed(next)
      })

      const dismiss = Effect.fn("GuardPins.dismiss")(function*(principal: Principal, id: GuardId) {
        yield* requirePermission(principal, "guards:manage")
        const guard = yield* load(principal, id)
        const pinning = guard.compiled?.pinning
        if (guard.compiled === null || pinning === undefined) return yield* new Conflict({ message: "verify the rule before choosing what it names" })
        const next: Guard = { ...guard, compiled: { ...guard.compiled, pinning: { ...pinning, status: "dismissed", candidates: [] } }, updatedAt: yield* DateTime.now }
        yield* guards.save(next)
        yield* audit.by(principal, "guard.updated", { type: "guard", id }, { pinCandidatesDismissed: pinning.candidates.map((c) => c.entityId) })
        return yield* resumed(next)
      })

      const unpin = Effect.fn("GuardPins.unpin")(function*(principal: Principal, id: GuardId, removedId: string) {
        yield* requirePermission(principal, "guards:manage")
        const guard = yield* load(principal, id)
        const removed = guard.pins.find((pin) => pin.id === removedId)
        if (removed === undefined) return yield* new NotFound({ entity: "guard", id: `${id}/pins/${removedId}` })
        const next: Guard = { ...guard, pins: guard.pins.filter((pin) => pin.id !== removedId), updatedAt: yield* DateTime.now }
        yield* guards.save(next)
        yield* children.clear(guard.orgId, removedId)
        yield* audit.by(principal, "guard.updated", { type: "guard", id }, { pinRemoved: audited(removed) })
        return next
      })

      const stats = Effect.fn("GuardPins.stats")(function*(principal: Principal, id: GuardId) {
        yield* requirePermission(principal, "resources:read")
        const guard = yield* load(principal, id)
        const known = yield* children.get(guard.orgId, guard.pins.map((pin) => pin.id))
        return guard.pins.map((pin): GuardPinStats => ({ pinId: pin.id, children: known.get(pin.id)?.size ?? 0 }))
      })

      return GuardPins.of({ confirm, dismiss, unpin, stats })
    })
  )
}
