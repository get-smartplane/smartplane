import { InvalidInput } from "@pc/domain"
import { Effect } from "effect"
import { HttpServerRequest } from "effect/http"
import { DefaultArchiveLimits } from "../../skills/archive/limits"
import { readCapped, TooLarge } from "./capped-body"

/** Room for multipart boundaries and headers around the archive itself. */
const MultipartOverhead = 64 * 1024

const invalid = (message: string) => new InvalidInput({ message, field: "archive" })

/**
 * The archive of an upload: the raw body, or the `file` field of a multipart form (what browsers and
 * `curl -F` send). The declared length is checked before anything is read, and the read itself is capped
 * (see `readCapped`), so a chunked body with no Content-Length cannot exceed it either.
 */
export const readUpload = (request: HttpServerRequest.HttpServerRequest): Effect.Effect<Uint8Array, InvalidInput> =>
  Effect.gen(function*() {
    const limit = DefaultArchiveLimits.maxCompressedBytes
    const multipart = (request.headers["content-type"] ?? "").toLowerCase().startsWith("multipart/form-data")
    const cap = multipart ? limit + MultipartOverhead : limit
    const declared = Number(request.headers["content-length"] ?? "0")
    const tooLarge = invalid(`the archive is larger than ${limit} bytes`)
    if (declared > cap) return yield* tooLarge
    const web = yield* HttpServerRequest.toWeb(request).pipe(Effect.mapError(() => invalid("the request body could not be read")))
    const raw = yield* readCapped(web.body, cap).pipe(Effect.mapError(() => invalid("the request body could not be read")))
    if (raw === TooLarge) return yield* tooLarge
    const body = multipart
      ? yield* Effect.tryPromise({
        // Parsed from the capped bytes, so the form parser never sees more than `cap`.
        try: async () => (await new Response(raw, { headers: { "content-type": request.headers["content-type"] ?? "" } }).formData()).get("file"),
        catch: () => invalid("the request body could not be read")
      }).pipe(Effect.flatMap((file) =>
        typeof file === "string" || file === null
          ? Effect.succeed(undefined)
          : Effect.tryPromise({ try: async () => new Uint8Array(await file.arrayBuffer()), catch: () => invalid("the request body could not be read") })
      ))
      : raw
    if (body === undefined) return yield* invalid("expected the archive in a multipart field named \"file\"")
    if (body.length > limit) return yield* tooLarge
    if (body.length === 0) return yield* invalid("the archive is empty")
    return body
  })
