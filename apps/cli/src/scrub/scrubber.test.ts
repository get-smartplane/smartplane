import { describe, expect, it } from "vitest"
import { encodings, scrubPatterns, type SecretValue } from "./patterns"
import { StreamScrubber } from "./scrubber"

const secrets: ReadonlyArray<SecretValue> = [
  { name: "STRIPE_KEY", value: "sk_live_51Hx/y+z=Q" },
  { name: "DB_PASSWORD", value: "p@ss wörd&\"quoted\"\n" },
  { name: "PIN", value: "1234" }
]
const { patterns, skipped } = scrubPatterns(secrets)

const run = (chunks: ReadonlyArray<Uint8Array>) => {
  const scrubber = new StreamScrubber(patterns)
  return Buffer.concat([...chunks.map((chunk) => scrubber.push(chunk)), scrubber.end()]).toString("utf8")
}
const whole = (text: string) => run([Buffer.from(text)])

/** Deterministic PRNG so failures reproduce. */
const random = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

const stripe = secrets[0]!.value
const password = secrets[1]!.value

describe("scrub patterns", () => {
  it("skips values shorter than 6 characters and reports them", () => {
    expect(skipped).toEqual(["PIN"])
    expect(whole("pin is 1234")).toBe("pin is 1234")
  })

  it("covers raw, both base64 alphabets with and without padding, URL and JSON escapes", () => {
    const b64 = Buffer.from(stripe).toString("base64")
    const forms = encodings(stripe)
    for (const form of [stripe, b64, b64.replace(/=+$/, ""), b64.replace(/\+/g, "-").replace(/\//g, "_"), encodeURIComponent(stripe)]) {
      expect(forms).toContain(form)
    }
    expect(encodings(password)).toContain(JSON.stringify(password).slice(1, -1))
  })
})

describe("StreamScrubber", () => {
  const b64 = Buffer.from(stripe).toString("base64")
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["raw", stripe],
    ["base64", b64],
    ["base64 without padding", b64.replace(/=+$/, "")],
    ["url-safe base64", b64.replace(/\+/g, "-").replace(/\//g, "_")],
    ["url-safe base64 without padding", b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")],
    ["url-encoded", encodeURIComponent(password)],
    ["form-encoded", encodeURIComponent(password).replace(/%20/g, "+")],
    ["JSON-escaped", JSON.stringify(password).slice(1, -1)],
    ["JSON-escaped, ASCII only", JSON.stringify(password).slice(1, -1).replace("ö", "\\u00f6")]
  ]

  it.each(cases)("replaces the %s form", (_, form) => {
    const out = whole(`before ${form} after`)
    expect(out).toMatch(/^before \[smartplane:(STRIPE_KEY|DB_PASSWORD)\] after$/)
  })

  it("catches base64 embedded in a longer encoded string at any alignment", () => {
    for (const user of ["a", "ab", "abc"]) {
      const header = `Authorization: Basic ${Buffer.from(`${user}:${stripe}`).toString("base64")}`
      expect(whole(header)).toContain("[smartplane:STRIPE_KEY]")
    }
  })

  it("redacts every byte of overlapping matches", () => {
    const { patterns: overlapping } = scrubPatterns([{ name: "A", value: "abcdefgh" }, { name: "B", value: "efghijkl" }])
    const scrubber = new StreamScrubber(overlapping)
    const out = Buffer.concat([scrubber.push(Buffer.from("xxabcdefghijklyy")), scrubber.end()]).toString()
    expect(out).toBe("xx[smartplane:A][smartplane:B]yy")
  })

  it("finds matches split across a chunk boundary at every offset", () => {
    const text = `log: key=${stripe} b64=${b64} json="${JSON.stringify(password).slice(1, -1)}" ü done\n`
    const expected = whole(text)
    expect(expected).not.toContain(stripe)
    const bytes = Buffer.from(text)
    for (let cut = 0; cut <= bytes.length; cut++) {
      expect(run([bytes.subarray(0, cut), bytes.subarray(cut)])).toBe(expected)
    }
  })

  it("gives the same output for random chunkings and never leaks a form (property)", () => {
    const next = random(42)
    const forms = [...encodings(stripe), ...encodings(password)]
    for (let round = 0; round < 300; round++) {
      const parts: Array<string> = []
      for (let i = 0; i < 6; i++) {
        parts.push("noise-é-".slice(0, Math.floor(next() * 8)))
        if (next() < 0.6) parts.push(forms[Math.floor(next() * forms.length)]!)
      }
      const bytes = Buffer.from(parts.join(""))
      const chunks: Array<Uint8Array> = []
      for (let at = 0; at < bytes.length;) {
        const size = 1 + Math.floor(next() * 7)
        chunks.push(bytes.subarray(at, at + size))
        at += size
      }
      const out = run(chunks)
      expect(out).toBe(whole(parts.join("")))
      for (const form of forms) expect(out).not.toContain(form)
    }
  })

  it("writes output that cannot start a secret immediately (no line buffering)", () => {
    const scrubber = new StreamScrubber(patterns)
    expect(scrubber.push(Buffer.from("Password: ")).toString()).toBe("Password: ")
    expect(scrubber.push(Buffer.from("sk_li")).toString()).toBe("")
    expect(scrubber.push(Buffer.from("ve_51Hx/y+z=Q!")).toString()).toBe("[smartplane:STRIPE_KEY]!")
    expect(scrubber.end().toString()).toBe("")
  })

  it("flushes a held-back partial match on end", () => {
    const scrubber = new StreamScrubber(patterns)
    expect(Buffer.concat([scrubber.push(Buffer.from("tail sk_live")), scrubber.end()]).toString()).toBe("tail sk_live")
  })
})
