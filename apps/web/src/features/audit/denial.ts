import { DenyReason } from "@pc/domain"
import { Option, Predicate, Schema } from "effect"
import { describeDenyReason, describeDenyTag } from "@/lib/api/deny-reason"

const DeniedCall = Schema.Struct({
  reasons: Schema.Array(Schema.Unknown),
  arguments: Schema.optionalKey(Schema.Unknown)
})
const Tagged = Schema.Struct({ _tag: Schema.String })

const decodeCall = Schema.decodeUnknownOption(DeniedCall)
const decodeReason = Schema.decodeUnknownOption(DenyReason)
const decodeTagged = Schema.decodeUnknownOption(Tagged)

/** `input.owner` inside the recorded arguments; undefined when any step is missing. */
const valueAt = (args: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((current, key) => (Predicate.isObject(current) ? current[key] : undefined), args)

const sentence = (raw: unknown, args: unknown): string =>
  Option.match(decodeReason(raw), {
    onSome: (reason) => describeDenyReason(reason, reason._tag === "ArgumentNotAllowed" ? valueAt(args, reason.path) : undefined),
    onNone: () => Option.match(decodeTagged(raw), { onSome: ({ _tag }) => describeDenyTag(_tag), onNone: () => "Denied by policy." })
  })

/** The readable reasons of a `policy.denied` event's data; empty for any other event. */
export const denialReasons = (data: unknown): ReadonlyArray<string> =>
  Option.match(decodeCall(data), { onNone: () => [], onSome: (call) => call.reasons.map((raw) => sentence(raw, call.arguments)) })
