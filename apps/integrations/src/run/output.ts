import { MaxOutputBytes } from "@pc/integrations/rpc"
import { Option, Schema } from "effect"

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json))

const isBinary = (value: unknown): value is ArrayBuffer | ArrayBufferView =>
  value instanceof ArrayBuffer || ArrayBuffer.isView(value)

/** JSON.stringify that survives what pieces return: bigints, binary buffers and cycles. */
const serialize = (value: unknown): string => {
  const ancestors: Array<unknown> = []
  return JSON.stringify(value ?? null, function(this: unknown, _key, inner: unknown) {
    if (typeof inner === "bigint") return inner.toString()
    if (isBinary(inner)) return `[${inner.byteLength} bytes of binary data omitted]`
    if (typeof inner !== "object" || inner === null) return inner
    while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop()
    if (ancestors.includes(inner)) return "[circular]"
    ancestors.push(inner)
    return inner
  }) ?? "null"
}

export interface Output {
  readonly output: Schema.Json
  readonly truncated: boolean
}

/**
 * A piece's return value as JSON, with credentials scrubbed and at most `MaxOutputBytes`: a larger result
 * becomes a text preview the agent can still read, flagged `truncated`.
 */
export const toOutput = (value: unknown, scrub: (text: string) => string): Output => {
  const text = scrub(serialize(value))
  if (text.length <= MaxOutputBytes) {
    return Option.match(decodeJson(text), {
      onNone: () => ({ output: text, truncated: false }),
      onSome: (output) => ({ output, truncated: false })
    })
  }
  return {
    output: { preview: text.slice(0, MaxOutputBytes), note: `Output cut from ${text.length} to ${MaxOutputBytes} characters.` },
    truncated: true
  }
}
