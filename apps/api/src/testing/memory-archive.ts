import { ArchiveUnavailable } from "@pc/domain"
import { Effect, Layer, Option, Stream } from "effect"
import { AuditArchive } from "../platform/archive"

export interface ArchivedObject {
  readonly body: string
  readonly metadata: Readonly<Record<string, string>>
  /** How many chunks an `upload` streamed in (1 for a `put`). */
  readonly chunks: number
}

const refusal = (key: string) => new ArchiveUnavailable({ operation: "put", message: `refused ${key}` })

/** An AuditArchive over a Map, so tests can drop or tamper with archived days; writes to `refused` keys fail. */
export const memoryArchive = (objects: Map<string, ArchivedObject>, refused: ReadonlySet<string> = new Set()) =>
  Layer.succeed(AuditArchive, {
    put: (key, body, metadata) =>
      refused.has(key) ? Effect.fail(refusal(key)) : Effect.sync(() => void objects.set(key, { body, metadata, chunks: 1 })),
    upload: (key, chunks, metadata) =>
      refused.has(key)
        ? Effect.fail(refusal(key))
        : Effect.map(Stream.runCollect(chunks), (all) => void objects.set(key, { body: all.join(""), metadata, chunks: all.length })),
    metadata: (key) => Effect.sync(() => Option.map(Option.fromUndefinedOr(objects.get(key)), (object) => object.metadata))
  })
