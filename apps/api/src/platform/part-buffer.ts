const encoder = new TextEncoder()

/**
 * Cuts a text stream into equal-size byte parts (R2 multipart requires every part but the last to be the
 * same size). A part is released only once more bytes follow it, so `rest()` is never empty after a part.
 */
export class PartBuffer {
  private chunks: Array<Uint8Array> = []
  private size = 0

  constructor(private readonly partBytes: number) {}

  /** Buffers `text` and returns every full part it completes. */
  push(text: string): ReadonlyArray<Uint8Array> {
    const bytes = encoder.encode(text)
    this.chunks.push(bytes)
    this.size += bytes.byteLength
    const parts: Array<Uint8Array> = []
    while (this.size > this.partBytes) parts.push(this.take(this.partBytes))
    return parts
  }

  /** Everything still buffered: the last (or only) part. */
  rest(): Uint8Array {
    return this.take(this.size)
  }

  private take(length: number): Uint8Array {
    const part = new Uint8Array(length)
    let filled = 0
    while (filled < length) {
      const head = this.chunks[0]
      if (head === undefined) break
      const used = Math.min(head.byteLength, length - filled)
      part.set(head.subarray(0, used), filled)
      filled += used
      if (used === head.byteLength) this.chunks.shift()
      else this.chunks[0] = head.subarray(used)
    }
    this.size -= filled
    return part
  }
}
