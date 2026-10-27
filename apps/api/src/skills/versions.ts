import {
  Conflict,
  type Forbidden,
  type NotFound,
  type OverrideScan,
  type Principal,
  type ResourceId,
  type ScanOverride,
  type SkillScanning,
  type SkillScanPolicy,
  type SkillVersion,
  type SkillVersionDetail
} from "@pc/domain"
import { Context, DateTime, Effect, Layer } from "effect"
import { AuditLog } from "../audit/audit-log"
import { requirePermission, requireUser } from "../auth/permissions"
import { AppConfig, skillScanningEnabled } from "../platform/config"
import { ResourceVisibility } from "../resources/resource-visibility"
import { ResourcesRepo } from "../resources/resources-repo"
import { loadSkill, loadVersion } from "./load"
import { SkillScanQueue } from "./scan/queue"
import { SkillScanners } from "./scan/scanner"
import { isServable } from "./scan/verdict"
import { SkillPolicyRepo } from "./storage/policy-repo"
import { SkillVersionsRepo } from "./storage/versions-repo"

const scanningOff = () => new Conflict({ message: "skill scanning is disabled for this deployment (SKILL_SCANNING=off)" })

/**
 * Reading, activating and re-scanning versions, scan overrides and the org's scan policy. Overrides need
 * `resources:manage`, a person and a reason, and are audited as `skill.scan_overridden`.
 */
export class SkillVersions extends Context.Service<SkillVersions, {
  readonly list: (principal: Principal, id: ResourceId) => Effect.Effect<ReadonlyArray<SkillVersion>, Forbidden | NotFound>
  readonly get: (principal: Principal, id: ResourceId, version: number) => Effect.Effect<SkillVersionDetail, Forbidden | NotFound>
  readonly activate: (principal: Principal, id: ResourceId, version: number) => Effect.Effect<SkillVersion, Forbidden | NotFound | Conflict>
  readonly rescan: (principal: Principal, id: ResourceId, version: number) => Effect.Effect<SkillVersion, Forbidden | NotFound | Conflict>
  readonly override: (principal: Principal, id: ResourceId, version: number, input: OverrideScan) => Effect.Effect<SkillVersion, Forbidden | NotFound | Conflict>
  readonly scanning: (principal: Principal) => Effect.Effect<SkillScanning, Forbidden>
  readonly updatePolicy: (principal: Principal, policy: SkillScanPolicy) => Effect.Effect<SkillScanning, Forbidden>
}>()("api/skills/SkillVersions") {
  static readonly layer = Layer.effect(
    SkillVersions,
    Effect.gen(function*() {
      const versions = yield* SkillVersionsRepo
      const policies = yield* SkillPolicyRepo
      const resources = yield* ResourcesRepo
      const queue = yield* SkillScanQueue
      const audit = yield* AuditLog
      const scanners = yield* SkillScanners
      const visibility = yield* ResourceVisibility
      const enabled = skillScanningEnabled(yield* AppConfig)

      const find = (principal: Principal, id: ResourceId, version: number) =>
        Effect.gen(function*() {
          yield* Effect.provideService(loadSkill(principal.orgId, id), ResourcesRepo, resources)
          return yield* Effect.provideService(loadVersion(principal.orgId, id, version), SkillVersionsRepo, versions)
        })

      const servable = (principal: Principal, version: SkillVersion) =>
        Effect.map(policies.get(principal.orgId), (policy) => isServable(version, policy, enabled))

      const target = (version: SkillVersion) => ({ type: "resource" as const, id: version.resourceId })

      const list = Effect.fn("SkillVersions.list")(function*(principal: Principal, id: ResourceId) {
        yield* requirePermission(principal, "resources:read")
        // Versions follow the skill's visibility: hidden skills are NotFound, like `GET /resources/:id`.
        yield* visibility.find(principal, id)
        yield* Effect.provideService(loadSkill(principal.orgId, id), ResourcesRepo, resources)
        return yield* versions.list(principal.orgId, id)
      })

      const get = Effect.fn("SkillVersions.get")(function*(principal: Principal, id: ResourceId, number: number) {
        yield* requirePermission(principal, "resources:read")
        yield* visibility.find(principal, id)
        const version = yield* find(principal, id, number)
        const detail: SkillVersionDetail = { version, reports: yield* versions.reports(version.id), servable: yield* servable(principal, version) }
        return detail
      })

      /** A version agents could not be served is refused rather than silently activated into nothing. */
      const activate = Effect.fn("SkillVersions.activate")(function*(principal: Principal, id: ResourceId, number: number) {
        yield* requirePermission(principal, "resources:manage")
        const user = yield* requireUser(principal)
        const version = yield* find(principal, id, number)
        if (!(yield* servable(principal, version))) {
          return yield* new Conflict({ message: `version ${number} is ${version.scanStatus} and cannot be served; re-scan or override it first` })
        }
        yield* versions.activate(version, user.userId)
        yield* audit.by(principal, "skill.activated", target(version), { versionId: version.id, version: number, contentHash: version.contentHash })
        return { ...version, active: true }
      })

      /** Clears any override first: it judged the old verdict, and must not pre-empt the new one. */
      const rescan = Effect.fn("SkillVersions.rescan")(function*(principal: Principal, id: ResourceId, number: number) {
        yield* requirePermission(principal, "resources:manage")
        if (!enabled) return yield* scanningOff()
        const version = yield* find(principal, id, number)
        yield* versions.requestScan(version)
        yield* audit.by(principal, "skill.rescan_requested", target(version), {
          versionId: version.id,
          version: number,
          contentHash: version.contentHash,
          scanStatus: version.scanStatus,
          ...(version.override === null ? {} : { clearedOverride: { by: version.override.by, reason: version.override.reason } })
        })
        yield* queue.send({ orgId: principal.orgId, versionId: version.id })
        const pending: SkillVersion = { ...version, scanStatus: "pending", override: null }
        return pending
      })

      /** Only a finished scan that refused the version (blocked) or could not run (error) can be overridden. */
      const override = Effect.fn("SkillVersions.override")(function*(principal: Principal, id: ResourceId, number: number, input: OverrideScan) {
        yield* requirePermission(principal, "resources:manage")
        const user = yield* requireUser(principal)
        if (!enabled) return yield* scanningOff()
        const version = yield* find(principal, id, number)
        if (version.scanStatus !== "blocked" && version.scanStatus !== "error") {
          return yield* new Conflict({ message: `version ${number} is ${version.scanStatus}; only a blocked or errored scan can be overridden` })
        }
        const decision: ScanOverride = { by: user.userId, reason: input.reason, at: yield* DateTime.now }
        if (!(yield* versions.saveOverride(version, decision))) {
          return yield* new Conflict({ message: `version ${number} changed while you were overriding it; reload and try again` })
        }
        yield* audit.by(principal, "skill.scan_overridden", target(version), {
          versionId: version.id,
          version: number,
          contentHash: version.contentHash,
          scanStatus: version.scanStatus,
          reason: input.reason
        })
        const overridden: SkillVersion = { ...version, override: decision }
        return overridden
      })

      const scanning = Effect.fn("SkillVersions.scanning")(function*(principal: Principal) {
        yield* requirePermission(principal, "resources:read")
        const settings: SkillScanning = { enabled, scanners: enabled ? scanners.map((scanner) => scanner.id) : [], policy: yield* policies.get(principal.orgId) }
        return settings
      })

      const updatePolicy = Effect.fn("SkillVersions.updatePolicy")(function*(principal: Principal, policy: SkillScanPolicy) {
        yield* requirePermission(principal, "org:manage")
        const user = yield* requireUser(principal)
        const before = yield* policies.get(principal.orgId)
        yield* policies.put(principal.orgId, policy, user.userId)
        yield* audit.by(principal, "skill.policy_updated", { type: "org", id: principal.orgId }, { from: before, to: policy })
        return yield* scanning(principal)
      })

      return SkillVersions.of({ list, get, activate, rescan, override, scanning, updatePolicy })
    })
  )
}
