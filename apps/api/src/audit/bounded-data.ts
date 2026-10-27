import { Effect } from "effect"
import { sha256Hex } from "../platform/encoding"
import { canonicalJson } from "./canonical-json"

/** One string value (e.g. a tool argument) above this is replaced by a marker. */
export const MaxStringBytes = 8 * 1024
/**
 * The whole `data` object stays under this. Cloudflare Queues rejects messages over 128 KB; the rest of the
 * event (actor, target, user agent, trace) is small, so a message always fits with room to spare.
 */
export const MaxDataBytes = 48 * 1024
const PreviewChars = 256

/** Stands in for a value too large to keep: enough to prove what it was (hash) without storing it. */
export interface OmittedValue {
  readonly omitted: "oversized"
  readonly sha256: string
  readonly bytes: number
  readonly preview?: string
}

const encoder = new TextEncoder()
const byteLength = (text: string): number => encoder.encode(text).byteLength

const jsonOf = (value: unknown): string => {
  try {
    return canonicalJson(value) ?? "null"
  } catch {
    return String(value)
  }
}

const omitted = (text: string, preview: boolean) =>
  Effect.map(Effect.promise(() => sha256Hex(text)), (sha256): OmittedValue => ({
    omitted: "oversized",
    sha256,
    bytes: byteLength(text),
    ...(preview ? { preview: text.slice(0, PreviewChars) } : {})
  }))

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const boundStrings = (value: unknown): Effect.Effect<unknown> => {
  if (typeof value === "string") return byteLength(value) > MaxStringBytes ? omitted(value, true) : Effect.succeed(value)
  if (Array.isArray(value)) return Effect.forEach(value, boundStrings)
  if (isPlainObject(value)) {
    return Effect.map(
      Effect.forEach(Object.entries(value), ([key, inner]) => Effect.map(boundStrings(inner), (bounded) => [key, bounded] as const)),
      Object.fromEntries
    )
  }
  return Effect.succeed(value)
}

/**
 * Keeps audit `data` under `MaxDataBytes`: long strings become markers with their SHA-256 and byte length,
 * then, if still too big, the largest top-level values do, and as a last resort the whole object does.
 */
export const boundAuditData = Effect.fnUntraced(function*(data: Readonly<Record<string, unknown>>) {
  const fits = (candidate: unknown) => byteLength(jsonOf(candidate)) <= MaxDataBytes
  if (fits(data)) return data
  const stringsBounded = yield* boundStrings(data)
  const bounded: Record<string, unknown> = isPlainObject(stringsBounded) ? { ...stringsBounded } : {}
  const bySize = Object.keys(bounded).sort((a, b) => byteLength(jsonOf(bounded[b])) - byteLength(jsonOf(bounded[a])))
  for (const key of bySize) {
    if (fits(bounded)) return bounded
    bounded[key] = yield* omitted(jsonOf(bounded[key]), false)
  }
  if (fits(bounded)) return bounded
  return { omitted: "oversized", sha256: (yield* omitted(jsonOf(data), false)).sha256, bytes: byteLength(jsonOf(data)) }
})
