import { type OrgId, Sha256Hex } from "@pc/domain"
import { DateTime, Option, Schema } from "effect"

/** One UTC day of the R2 archive: `[from, to)` and its `YYYY-MM-DD` name. */
export interface ArchiveDay {
  readonly from: DateTime.Utc
  readonly to: DateTime.Utc
  readonly date: string
}

export const archiveDay = (at: DateTime.Utc): ArchiveDay => {
  const from = DateTime.startOf(at, "day")
  return { from, to: DateTime.add(from, { days: 1 }), date: DateTime.formatIso(from).slice(0, 10) }
}

export const archiveKey = (orgId: OrgId, day: ArchiveDay): string => `org=${orgId}/day=${day.date}/events.ndjson`

const SeqString = Schema.FiniteFromString.check(Schema.isInt())

/** R2 custom metadata of a day archive: the seq range it holds and the hash of its last event. */
export const ArchiveMetadata = Schema.Struct({ firstSeq: SeqString, lastSeq: SeqString, lastHash: Sha256Hex })
export type ArchiveMetadata = typeof ArchiveMetadata.Type

/** The seq range one archived day holds, as read from D1 when its export starts. */
export interface ArchivedRange {
  readonly firstSeq: number
  readonly lastSeq: number
  readonly lastHash: string
}

export const archiveMetadataOf = (range: ArchivedRange): Record<string, string> => ({
  firstSeq: String(range.firstSeq),
  lastSeq: String(range.lastSeq),
  lastHash: range.lastHash
})

/**
 * The archive covers what D1 still holds for that day: same last seq and hash, and no event before its first
 * seq (rows below it may already be purged when a day straddled an earlier purge boundary).
 */
export const covers = (metadata: Option.Option<ArchiveMetadata>, range: ArchivedRange): boolean =>
  Option.isSome(metadata) &&
  metadata.value.lastSeq === range.lastSeq &&
  metadata.value.lastHash === range.lastHash &&
  metadata.value.firstSeq <= range.firstSeq
