import { Transform } from "node:stream"
import { type Automaton, buildAutomaton } from "./aho-corasick"
import type { ScrubPattern } from "./patterns"

interface Region {
  start: number
  end: number
  readonly names: Array<string>
  /** Its label was already written because the region outgrew the hold-back cap. */
  labelled: boolean
}

export const label = (name: string) => `[smartplane:${name}]`

/** Past this much held-back output (only possible with overlapping matches running on and on), write what we have. */
const holdCap = 1 << 20

const empty = Buffer.alloc(0)

/**
 * Replaces every occurrence of every pattern in a byte stream with `[smartplane:NAME]`.
 *
 * Positions are absolute stream offsets. Overlapping occurrences are merged into one region so no byte of any
 * occurrence is ever written. The scrubber holds back only the bytes that could still begin an occurrence (the
 * automaton depth, at most the longest pattern minus one), plus any region that may still grow; everything
 * else is written at once, so prompts and partial lines are not delayed. `end()` flushes the rest.
 */
export class StreamScrubber {
  private readonly automaton: Automaton
  private state = 0
  private base = 0
  private held: Buffer = empty
  private regions: Array<Region> = []

  constructor(private readonly patterns: ReadonlyArray<ScrubPattern>) {
    this.automaton = buildAutomaton(patterns.map((pattern) => pattern.bytes))
  }

  push(chunk: Uint8Array): Buffer {
    const offset = this.base + this.held.length
    for (let i = 0; i < chunk.length; i++) {
      this.state = this.automaton.next(this.state, chunk[i] ?? 0)
      for (const index of this.automaton.matches(this.state)) {
        const pattern = this.patterns[index]
        if (pattern !== undefined) this.mark(offset + i + 1 - pattern.bytes.length, offset + i + 1, pattern.name)
      }
    }
    this.held = this.held.length === 0 ? Buffer.from(chunk) : Buffer.concat([this.held, chunk])
    const safe = offset + chunk.length - this.automaton.depth(this.state)
    const growing = this.regions.find((region) => region.end > safe)
    if (growing === undefined || growing.start >= safe) return this.release(safe)
    if (safe - this.base <= holdCap) return this.release(growing.start)
    const before = this.release(growing.start)
    const secret = growing.labelled ? "" : growing.names.map(label).join("")
    this.drop(safe)
    growing.start = safe
    growing.labelled = true
    return Buffer.concat([before, Buffer.from(secret)])
  }

  end(): Buffer {
    const rest = this.release(this.base + this.held.length)
    this.state = 0
    return rest
  }

  /** Matches arrive ordered by end, so every region a new match overlaps is at the tail of the list. */
  private mark(start: number, end: number, name: string) {
    let region: Region = { start, end, names: [name], labelled: false }
    for (let last = this.regions.at(-1); last !== undefined && last.end > region.start; last = this.regions.at(-1)) {
      this.regions.pop()
      const names = [...last.names, ...region.names.filter((n) => !last.names.includes(n))]
      region = { start: Math.min(last.start, region.start), end: Math.max(last.end, region.end), names, labelled: last.labelled }
    }
    this.regions.push(region)
  }

  /** Writes everything before `cut`, with each finished region replaced by its labels. */
  private release(cut: number): Buffer {
    if (cut <= this.base) return empty
    const parts: Array<Buffer> = []
    let at = this.base
    for (let region = this.regions[0]; region !== undefined && region.end <= cut; region = this.regions[0]) {
      this.regions.shift()
      parts.push(this.slice(at, region.start))
      if (!region.labelled) parts.push(Buffer.from(region.names.map(label).join("")))
      at = region.end
    }
    parts.push(this.slice(at, cut))
    this.drop(cut)
    return Buffer.concat(parts)
  }

  private slice(from: number, to: number) {
    return this.held.subarray(from - this.base, to - this.base)
  }

  private drop(cut: number) {
    this.held = this.held.subarray(cut - this.base)
    this.base = cut
  }
}

/** A Node transform for a child's stdout or stderr. */
export const scrubStream = (patterns: ReadonlyArray<ScrubPattern>) => {
  const scrubber = new StreamScrubber(patterns)
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      const out = scrubber.push(chunk)
      done(null, out.length > 0 ? out : undefined)
    },
    flush(done) {
      const out = scrubber.end()
      done(null, out.length > 0 ? out : undefined)
    }
  })
}
