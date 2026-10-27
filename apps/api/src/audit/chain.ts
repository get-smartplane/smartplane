import { AuditEvent, ChainedAuditEvent, ChainVerification } from "@pc/domain"
import { Effect, Schema } from "effect"
import { sha256Hex } from "../platform/encoding"
import { canonicalJson } from "./canonical-json"

/** `prevHash` of the first event of every org. */
export const GenesisHash = "0".repeat(64)

export interface ChainHead {
  readonly seq: number
  readonly hash: string
}

export const emptyHead: ChainHead = { seq: 0, hash: GenesisHash }

const encodeEvent = Schema.encodeSync(Schema.toCodecJson(AuditEvent))

/** The hashed form: the event's JSON encoding (ISO timestamps, sorted keys) plus its position. */
export const canonicalEvent = (event: AuditEvent, seq: number): string => canonicalJson({ seq, event: encodeEvent(event) })

export const linkHash = (prevHash: string, event: AuditEvent, seq: number): Effect.Effect<string> =>
  Effect.promise(() => sha256Hex(prevHash + canonicalEvent(event, seq)))

const unchained = ({ seq: _seq, prevHash: _prevHash, hash: _hash, ...event }: ChainedAuditEvent): AuditEvent => event

/** Appends `event` after `head`. */
export const chain = Effect.fnUntraced(function*(head: ChainHead, event: AuditEvent) {
  const seq = head.seq + 1
  const hash = yield* linkHash(head.hash, event, seq)
  const chained: ChainedAuditEvent = { ...event, seq, prevHash: head.hash, hash }
  return chained
})

/**
 * Re-hashes `events` (ascending, starting at `fromSeq`). Detects edited events (hash mismatch), deleted
 * or reordered events (seq gap or broken `prevHash` link) and a forged start of the chain. `anchor` is the
 * hash the first event must link to: the genesis hash at seq 1, a purge checkpoint's hash right after it,
 * otherwise unknown (a window starting mid-chain only checks links within the window).
 */
export const verifyChain = Effect.fnUntraced(function*(
  events: ReadonlyArray<ChainedAuditEvent>,
  fromSeq: number,
  anchor: string | undefined = fromSeq === 1 ? GenesisHash : undefined
) {
  let expectedPrev = anchor
  for (const [index, event] of events.entries()) {
    const broken = ChainVerification.cases.Broken.make({ fromSeq, checked: index, at: fromSeq + index })
    if (event.seq !== fromSeq + index) return broken
    if (expectedPrev !== undefined && event.prevHash !== expectedPrev) return broken
    if ((yield* linkHash(event.prevHash, unchained(event), event.seq)) !== event.hash) return broken
    expectedPrev = event.hash
  }
  return ChainVerification.cases.Intact.make({ fromSeq, checked: events.length })
})
