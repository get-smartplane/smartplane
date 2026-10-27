import { assert, describe, it } from "@effect/vitest"
import { PartBuffer } from "./part-buffer"

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe("multipart part buffer", () => {
  it("cuts equal parts, holds one back until more follows, and leaves a non-empty rest", () => {
    const buffer = new PartBuffer(4)
    assert.deepStrictEqual(buffer.push("abc").map(text), [])
    assert.deepStrictEqual(buffer.push("d").map(text), [], "exactly one part is held until more follows")
    assert.deepStrictEqual(buffer.push("efghij").map(text), ["abcd", "efgh"])
    assert.strictEqual(text(buffer.rest()), "ij")
    assert.strictEqual(buffer.rest().byteLength, 0)
  })

  it("splits multi-byte text by bytes without losing any", () => {
    const buffer = new PartBuffer(5)
    const parts = [...buffer.push("ééé"), ...buffer.push("ééé")]
    const all = new Uint8Array([...parts.flatMap((part) => [...part]), ...buffer.rest()])
    assert.isTrue(parts.every((part) => part.byteLength === 5))
    assert.strictEqual(text(all), "éééééé")
  })
})
