export type ValueKind = "secret" | "variable"

export interface Classified {
  readonly kind: ValueKind
  /** Why, in a few words, so the person reviewing the list can disagree. */
  readonly reason: string
}

const secretWords = new Set([
  "KEY", "APIKEY", "SECRET", "TOKEN", "PASSWORD", "PASSWD", "PASS", "PWD", "PRIVATE", "DSN", "CREDENTIAL", "CREDENTIALS",
  "AUTH", "SALT", "CERT", "SIGNING", "PAT", "WEBHOOK"
])
const connectionUrl = /^(DATABASE|DB|POSTGRES|POSTGRESQL|PG|MYSQL|MONGO|MONGODB|REDIS|AMQP|RABBITMQ|KAFKA|SUPABASE_DB)(_[A-Z0-9]+)*_(URL|URI)$|^(DATABASE|REDIS|MONGO)_URL$/
/** Bundled into browser code by the framework, so public by design. */
const publicPrefix = /^(NEXT_PUBLIC|VITE|PUBLIC|EXPO_PUBLIC|NUXT_PUBLIC|REACT_APP|GATSBY)_/

/** Bits of entropy per character, from the value's own character frequencies. */
export const entropy = (value: string): number => {
  const counts = new Map<string, number>()
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1)
  let bits = 0
  for (const count of counts.values()) {
    const p = count / value.length
    bits -= p * Math.log2(p)
  }
  return bits
}

/** Long, mixed letters and digits, no spaces, not a plain URL or path: how generated keys look. */
const looksRandom = (value: string) =>
  value.length >= 20 && !/\s/.test(value) && /[A-Za-z]/.test(value) && /\d/.test(value) &&
  !/^(https?:\/\/[^@]*|\/|\.\/)/.test(value) && entropy(value) >= 3.5

/**
 * Secret or plain variable, by name first and value second. It errs towards secret: a variable marked
 * secret only costs a step, a secret stored as a variable is readable by anyone granted it.
 */
export const classify = (name: string, value: string): Classified => {
  if (publicPrefix.test(name)) return { kind: "variable", reason: "public prefix" }
  const words = name.toUpperCase().split(/[^A-Z0-9]+/)
  if (words.some((word) => secretWords.has(word)) || /SECRET|PASSWORD|TOKEN|PRIVATE_KEY|API_?KEY/.test(name.toUpperCase())) {
    return { kind: "secret", reason: "name" }
  }
  if (connectionUrl.test(name.toUpperCase())) return { kind: "secret", reason: "connection string" }
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i.test(value)) return { kind: "secret", reason: "credentials in URL" }
  if (looksRandom(value)) return { kind: "secret", reason: "looks generated" }
  return { kind: "variable", reason: "plain value" }
}

/**
 * Enough to recognise a value without revealing it: `sk_l…(51 chars)`. Values shorter than 16 characters
 * show only their length, since four characters of a short value are most of it.
 */
export const maskedPreview = (value: string): string =>
  value.length >= 16 ? `${value.slice(0, 4)}…(${value.length} chars)` : `…(${value.length} chars)`
