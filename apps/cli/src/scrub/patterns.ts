/** Shorter values would scrub ordinary words and numbers out of the output, so they are skipped and listed. */
export const minScrubLength = 6

export interface SecretValue {
  readonly name: string
  readonly value: string
}

export interface ScrubPattern {
  readonly name: string
  readonly bytes: Uint8Array
}

export interface ScrubPatterns {
  readonly patterns: ReadonlyArray<ScrubPattern>
  /** Names whose values are too short to scrub safely. */
  readonly skipped: ReadonlyArray<string>
}

const urlSafe = (base64: string) => base64.replace(/\+/g, "-").replace(/\//g, "_")
const unpadded = (base64: string) => base64.replace(/=+$/, "")

/**
 * Base64 of the value as it appears inside a longer encoded string (`Basic base64(user:password)`): with k
 * bytes before it, only the characters whose 6 bits all come from the value are fixed, whatever surrounds it.
 */
const embeddedBase64 = (bytes: Buffer): ReadonlyArray<string> =>
  [0, 1, 2].map((k) => {
    const encoded = Buffer.concat([Buffer.alloc(k), bytes]).toString("base64")
    return encoded.slice(Math.ceil((8 * k) / 6), Math.floor((8 * (k + bytes.length)) / 6))
  })

const base64Forms = (bytes: Buffer): ReadonlyArray<string> => {
  const standard = bytes.toString("base64")
  const forms = [standard, unpadded(standard), ...embeddedBase64(bytes)]
  return [...forms, ...forms.map(urlSafe)]
}

const urlForms = (value: string): ReadonlyArray<string> => {
  const encoded = encodeURIComponent(value)
  const lowerHex = encoded.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase())
  return [encoded, encoded.replace(/%20/g, "+"), lowerHex]
}

const jsonForms = (value: string): ReadonlyArray<string> => {
  const standard = JSON.stringify(value).slice(1, -1)
  // Python's json.dumps and others escape every non-ASCII character as \uXXXX.
  const ascii = standard.replace(/[\u0080-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`)
  return [standard, ascii, standard.replace(/\//g, "\\/"), ascii.replace(/\//g, "\\/")]
}

/** Every encoding of `value` a program is likely to print: raw, base64 (both alphabets), URL and JSON escapes. */
export const encodings = (value: string): ReadonlyArray<string> => {
  const bytes = Buffer.from(value, "utf8")
  const forms = [value, ...base64Forms(bytes), ...urlForms(value), ...jsonForms(value)]
  return [...new Set(forms)].filter((form) => form.length >= minScrubLength)
}

/** The byte patterns to scrub for each secret; a value shared by two secrets is labelled with the first name. */
export const scrubPatterns = (secrets: ReadonlyArray<SecretValue>): ScrubPatterns => {
  const seen = new Set<string>()
  const patterns: Array<ScrubPattern> = []
  const skipped: Array<string> = []
  for (const { name, value } of secrets) {
    if ([...value].length < minScrubLength) {
      skipped.push(name)
      continue
    }
    for (const form of encodings(value)) {
      if (seen.has(form)) continue
      seen.add(form)
      patterns.push({ name, bytes: Buffer.from(form, "utf8") })
    }
  }
  return { patterns, skipped }
}
