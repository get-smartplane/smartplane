import { ArchiveUnavailable } from "@pc/domain"
import { Context, Effect, Layer, Option, Stream } from "effect"
import { WorkerBindings } from "./bindings"
import { PartBuffer } from "./part-buffer"

type Metadata = Readonly<Record<string, string>>

/**
 * R2 multipart parts must all be the same size except the last (minimum 5 MiB). 8 MiB keeps one org-day's
 * export at about one part in memory, however busy the day was.
 */
export const ArchivePartBytes = 8 * 1024 * 1024

const r2 = <A>(operation: string, key: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new ArchiveUnavailable({ operation, message: `R2 ${operation} ${key} failed: ${String(cause)}` })
  })

const ndjson = { httpMetadata: { contentType: "application/x-ndjson" } }

/** The R2 audit archive. Objects are write-once in practice: enable R2 bucket lock for WORM retention. */
export class AuditArchive extends Context.Service<AuditArchive, {
  readonly put: (key: string, body: string, metadata: Metadata) => Effect.Effect<void, ArchiveUnavailable>
  /** Writes `chunks` to `key` in bounded memory: one put when they fit in a part, else a multipart upload. */
  readonly upload: <E, R>(key: string, chunks: Stream.Stream<string, E, R>, metadata: Metadata) => Effect.Effect<void, ArchiveUnavailable | E, R>
  /** The custom metadata of an archived object, without reading its body; none when the key is absent. */
  readonly metadata: (key: string) => Effect.Effect<Option.Option<Metadata>, ArchiveUnavailable>
}>()("api/platform/AuditArchive") {
  static readonly layer = Layer.effect(
    AuditArchive,
    Effect.gen(function*() {
      const bucket = (yield* WorkerBindings).AUDIT_ARCHIVE

      const put = Effect.fn("AuditArchive.put")(function*(key: string, body: string | Uint8Array, metadata: Metadata) {
        yield* Effect.annotateCurrentSpan({ "r2.key": key })
        yield* r2("put", key, () => bucket.put(key, body, { ...ndjson, customMetadata: { ...metadata } }))
      })

      const upload = Effect.fn("AuditArchive.upload")(function*<E, R>(key: string, chunks: Stream.Stream<string, E, R>, metadata: Metadata) {
        yield* Effect.annotateCurrentSpan({ "r2.key": key })
        const buffer = new PartBuffer(ArchivePartBytes)
        let multipart: R2MultipartUpload | undefined
        const parts: Array<R2UploadedPart> = []
        const send = (part: Uint8Array) =>
          Effect.gen(function*() {
            const target = multipart ??
              (multipart = yield* r2("createMultipartUpload", key, () =>
                bucket.createMultipartUpload(key, { ...ndjson, customMetadata: { ...metadata } })))
            const upload = target
            parts.push(yield* r2("uploadPart", key, () => upload.uploadPart(parts.length + 1, part)))
          })
        const written = Stream.runForEach(chunks, (chunk) => Effect.forEach(buffer.push(chunk), send, { discard: true })).pipe(
          Effect.andThen(Effect.suspend(() => {
            const rest = buffer.rest()
            if (multipart === undefined) return put(key, rest, metadata)
            const done = multipart
            return Effect.andThen(send(rest), r2("complete", key, () => done.complete(parts)))
          }))
        )
        // An unfinished multipart upload holds storage until aborted; nothing partial ever becomes the object.
        yield* written.pipe(
          Effect.onError(() => multipart === undefined ? Effect.void : Effect.ignore(r2("abort", key, () => multipart?.abort() ?? Promise.resolve())))
        )
        yield* Effect.annotateCurrentSpan({ "r2.parts": Math.max(parts.length, 1) })
      })

      return AuditArchive.of({
        put,
        upload,
        metadata: Effect.fn("AuditArchive.metadata")(function*(key: string) {
          yield* Effect.annotateCurrentSpan({ "r2.key": key })
          const object = yield* r2("head", key, () => bucket.head(key))
          return Option.map(Option.fromNullishOr(object), (found) => found.customMetadata ?? {})
        })
      })
    })
  )
}
