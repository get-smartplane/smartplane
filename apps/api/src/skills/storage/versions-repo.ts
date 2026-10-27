import {
  type Conflict,
  type OrgId,
  type ResourceId,
  ScanOverride,
  ScanReport,
  ScanSummary,
  SkillFile,
  SkillSourceSnapshot,
  SkillVersion,
  type SkillVersionId,
  type UserId
} from "@pc/domain"
import { D1Client } from "@effect/sql-d1"
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect"
import type { Verdict } from "../scan/verdict"
import { conflictOnDuplicate, decodeFirst, decodeRows, encodeRow, JsonColumn } from "../../platform/sql"

const VersionRow = Schema.toCodecJson(Schema.Struct({
  ...SkillVersion.fields,
  source: JsonColumn(SkillSourceSnapshot),
  files: JsonColumn(Schema.Array(SkillFile)),
  scanSummary: JsonColumn(ScanSummary),
  override: Schema.NullOr(JsonColumn(ScanOverride)),
  active: Schema.BooleanFromBit
})).pipe(Schema.decodeTo(SkillVersion))
const encodeVersion = encodeRow(VersionRow)

const ReportRow = Schema.Struct({ report: JsonColumn(ScanReport) })
const encodeReport = Schema.encodeEffect(JsonColumn(ScanReport))
const encodeOverride = Schema.encodeEffect(JsonColumn(ScanOverride))
const encodeSummary = Schema.encodeEffect(JsonColumn(ScanSummary))
const NumberRow = Schema.Struct({ version: Schema.Int })
const duplicate = conflictOnDuplicate("another version of this skill was added at the same time; try again")

/** A version as stored before it has a number or an activation. */
export type NewSkillVersion = Omit<SkillVersion, "version" | "active">

/** Skill versions, their latest scan reports and the active pointer. Versions are append-only. */
export class SkillVersionsRepo extends Context.Service<SkillVersionsRepo, {
  /** Inserts with the next version number for the skill and returns it; a concurrent insert that took the number is a `Conflict`. */
  readonly insert: (version: NewSkillVersion) => Effect.Effect<number, Conflict>
  readonly list: (orgId: OrgId, resourceId: ResourceId) => Effect.Effect<ReadonlyArray<SkillVersion>>
  readonly find: (orgId: OrgId, resourceId: ResourceId, version: number) => Effect.Effect<Option.Option<SkillVersion>>
  readonly findById: (orgId: OrgId, id: SkillVersionId) => Effect.Effect<Option.Option<SkillVersion>>
  /** The active version of each of `resourceIds` that has one. */
  readonly active: (orgId: OrgId, resourceIds: ReadonlyArray<ResourceId>) => Effect.Effect<ReadonlyArray<SkillVersion>>
  readonly activate: (version: SkillVersion, by: UserId) => Effect.Effect<void>
  /** Back to `pending` for a re-scan; any override goes, so it cannot pre-empt the new verdict. */
  readonly requestScan: (version: SkillVersion) => Effect.Effect<void>
  /**
   * Stores a scan's verdict and reports only if the version's status and override are still what `version`
   * (read when the scan started) says; false when someone overrode or re-scanned it meanwhile.
   */
  readonly saveScan: (version: SkillVersion, verdict: Verdict, reports: ReadonlyArray<ScanReport>) => Effect.Effect<boolean>
  /** Sets the override only while the version's status is still the blocked or error `version` says; false otherwise. */
  readonly saveOverride: (version: SkillVersion, override: ScanOverride) => Effect.Effect<boolean>
  /** Whether any version of the org lists a file with this content hash. */
  readonly usesBlob: (orgId: OrgId, sha256: string) => Effect.Effect<boolean>
  readonly reports: (id: SkillVersionId) => Effect.Effect<ReadonlyArray<ScanReport>>
}>()("api/skills/SkillVersionsRepo") {
  static readonly layer = Layer.effect(
    SkillVersionsRepo,
    Effect.gen(function*() {
      const sql = yield* D1Client.D1Client
      const select = sql`SELECT v.*, CASE WHEN a.version_id = v.id THEN 1 ELSE 0 END AS active
                           FROM skill_versions v LEFT JOIN skill_active_versions a ON a.resource_id = v.resource_id`
      const rows = decodeRows(VersionRow)
      const first = decodeFirst(VersionRow)

      return SkillVersionsRepo.of({
        insert: Effect.fn("SkillVersionsRepo.insert")(function*(version: NewSkillVersion) {
          const row = yield* encodeVersion({ ...version, version: 1, active: false })
          // The number is taken inside the INSERT, so concurrent versions cannot share one; should a race still
          // reach the UNIQUE constraint, the caller gets a Conflict (retryable), not a 500.
          const returned = yield* sql`INSERT INTO skill_versions (id, org_id, resource_id, version, source, content_hash, files, name, description,
                                            scan_status, scan_summary, override, created_by, created_at)
                SELECT ${row.id}, ${row.orgId}, ${row.resourceId}, COALESCE(MAX(version), 0) + 1, ${row.source}, ${row.contentHash},
                       ${row.files}, ${row.name}, ${row.description}, ${row.scanStatus}, ${row.scanSummary}, ${row.override},
                       ${row.createdBy}, ${row.createdAt}
                  FROM skill_versions WHERE resource_id = ${version.resourceId}
                RETURNING version`.pipe(duplicate)
          const inserted = yield* decodeFirst(NumberRow)(Effect.succeed(returned))
          return yield* Effect.orDie(Effect.map(Effect.fromOption(inserted), (found) => found.version))
        }),
        list: Effect.fn("SkillVersionsRepo.list")((orgId: OrgId, resourceId: ResourceId) =>
          rows(sql`${select} WHERE v.org_id = ${orgId} AND v.resource_id = ${resourceId} ORDER BY v.version DESC`)
        ),
        find: Effect.fn("SkillVersionsRepo.find")((orgId: OrgId, resourceId: ResourceId, version: number) =>
          first(sql`${select} WHERE v.org_id = ${orgId} AND v.resource_id = ${resourceId} AND v.version = ${version}`)
        ),
        findById: Effect.fn("SkillVersionsRepo.findById")((orgId: OrgId, id: SkillVersionId) =>
          first(sql`${select} WHERE v.org_id = ${orgId} AND v.id = ${id}`)
        ),
        active: Effect.fn("SkillVersionsRepo.active")((orgId: OrgId, resourceIds: ReadonlyArray<ResourceId>) =>
          resourceIds.length === 0
            ? Effect.succeed([])
            : rows(sql`SELECT v.*, 1 AS active FROM skill_active_versions a JOIN skill_versions v ON v.id = a.version_id
                        WHERE a.org_id = ${orgId} AND ${sql.in("a.resource_id", resourceIds)}`)
        ),
        activate: Effect.fn("SkillVersionsRepo.activate")(function*(version: SkillVersion, by: UserId) {
          const now = DateTime.formatIso(yield* DateTime.now)
          yield* sql`INSERT INTO skill_active_versions (resource_id, org_id, version_id, activated_by, activated_at)
                     VALUES (${version.resourceId}, ${version.orgId}, ${version.id}, ${by}, ${now})
                     ON CONFLICT (resource_id) DO UPDATE SET version_id = excluded.version_id,
                       activated_by = excluded.activated_by, activated_at = excluded.activated_at`.pipe(Effect.orDie)
        }),
        requestScan: Effect.fn("SkillVersionsRepo.requestScan")(function*(version: SkillVersion) {
          yield* sql`UPDATE skill_versions SET scan_status = 'pending', override = NULL
                      WHERE id = ${version.id} AND org_id = ${version.orgId}`.pipe(Effect.orDie)
        }),
        saveScan: Effect.fn("SkillVersionsRepo.saveScan")(function*(version: SkillVersion, verdict: Verdict, reports: ReadonlyArray<ScanReport>) {
          const summary = yield* Effect.orDie(encodeSummary(verdict.summary))
          // Status and whether an override exists, as read when the scan started: a scan never writes the override.
          const same = sql`scan_status = ${version.scanStatus} AND (override IS NULL) = ${version.override === null ? 1 : 0}`
          const unchanged = sql`SELECT 1 FROM skill_versions WHERE id = ${version.id} AND org_id = ${version.orgId} AND ${same}`
          const encoded = yield* Effect.forEach(reports, (report) => Effect.map(Effect.orDie(encodeReport(report)), (json) => [report.scanner, json] as const))
          // Reports first, guarded by the same compare as the verdict, so a lost race writes neither.
          const results = yield* sql.batch([
            ...encoded.map(([scanner, json]) =>
              sql`INSERT INTO skill_scan_reports (version_id, scanner, report) SELECT ${version.id}, ${scanner}, ${json} WHERE EXISTS (${unchanged})
                  ON CONFLICT (version_id, scanner) DO UPDATE SET report = excluded.report`
            ),
            sql`UPDATE skill_versions SET scan_status = ${verdict.status}, scan_summary = ${summary}
                 WHERE id = ${version.id} AND org_id = ${version.orgId} AND ${same}
                 RETURNING id`
          ]).pipe(Effect.orDie)
          return (results.at(-1)?.length ?? 0) > 0
        }),
        saveOverride: Effect.fn("SkillVersionsRepo.saveOverride")(function*(version: SkillVersion, override: ScanOverride) {
          const json = yield* Effect.orDie(encodeOverride(override))
          const updated = yield* sql`UPDATE skill_versions SET override = ${json}
                                      WHERE id = ${version.id} AND org_id = ${version.orgId}
                                        AND scan_status IN ('blocked', 'error') AND scan_status = ${version.scanStatus}
                                      RETURNING id`.pipe(Effect.orDie)
          return updated.length > 0
        }),
        usesBlob: Effect.fn("SkillVersionsRepo.usesBlob")(function*(orgId: OrgId, sha256: string) {
          const found = yield* sql`SELECT 1 AS used FROM skill_versions WHERE org_id = ${orgId} AND instr(files, ${`"${sha256}"`}) > 0 LIMIT 1`.pipe(Effect.orDie)
          return found.length > 0
        }),
        reports: Effect.fn("SkillVersionsRepo.reports")((id: SkillVersionId) =>
          Effect.map(decodeRows(ReportRow)(sql`SELECT report FROM skill_scan_reports WHERE version_id = ${id} ORDER BY scanner`), (found) =>
            found.map((row) => row.report))
        )
      })
    })
  )
}
