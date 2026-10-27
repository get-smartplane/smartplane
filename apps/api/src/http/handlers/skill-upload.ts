import { InvalidInput } from "@pc/domain"
import { Effect } from "effect"
import { HttpServerRequest } from "effect/http"
import { DefaultArchiveLimits } from "../../skills/archive/limits"

/** Room for multipart boundaries and headers around the archive itself. */
const MultipartOverhead = 64 * 1024

const invalid = (message: string) => new InvalidInput({ message, field: "archive" })

/**
 * The archive of an upload: the raw body, or the `file` field of a multipart form (what browsers and
 * `curl -F` send). The declared length is checked before anything is read, and the read itself is capped.
 */
export const readUpload = (request: HttpServerRequest.HttpServerRequest): Effect.Effect<Uint8Array, InvalidInput> =>
  Effect.gen(function*() {
    const limit = DefaultArchiveLimits.maxCompressedBytes
    const multipart = (request.headers["content-type"] ?? "").toLowerCase().startsWith("multipart/form-data")
    const cap = multipart ? limit + MultipartOverhead : limit
    const declared = Number(request.headers["content-length"] ?? "0")
    if (declared > cap) return yield* invalid(`the archive is larger than ${limit} bytes`)
    const web = yield* HttpServerRequest.toWeb(request).pipe(Effect.mapError(() => invalid("the request body could not be read")))
    const body = yield* Effect.tryPromise({
      try: async () => {
        if (!multipart) return new Uint8Array(await web.arrayBuffer())
        const file = (await web.formData()).get("file")
        return typeof file === "string" || file === null ? undefined : new Uint8Array(await file.arrayBuffer())
      },
      catch: () => invalid("the request body could not be read")
    })
    if (body === undefined) return yield* invalid("expected the archive in a multipart field named \"file\"")
    if (body.length > limit) return yield* invalid(`the archive is larger than ${limit} bytes`)
    if (body.length === 0) return yield* invalid("the archive is empty")
    return body
  })
