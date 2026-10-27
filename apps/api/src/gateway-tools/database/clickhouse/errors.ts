import { Option, Schema } from "effect"

/**
 * A ClickHouse failure as the agent sees it. The runner turns it into `UpstreamFailure` (scrubbing the
 * connection string and password once more), so messages here are already safe and short.
 */
export class ClickHouseError extends Schema.TaggedError<ClickHouseError>()("ClickHouseError", {
  /** ClickHouse's numeric error code, when the server answered with one. */
  code: Schema.NullOr(Schema.Int),
  message: Schema.String
}) {}

/** UNKNOWN_USER, WRONG_PASSWORD, REQUIRED_PASSWORD, AUTHENTICATION_FAILED: the reply would name the login. */
const authenticationCodes: ReadonlySet<number> = new Set([192, 193, 194, 516])
const Readonly = 164
const TimeoutExceeded = 159
const MaxDetailLength = 500
/** Error replies are short; a broken server's long body is not worth parsing. */
const MaxBodyLength = 8_192

const decodeCode = Schema.decodeUnknownOption(Schema.NumberFromString.check(Schema.isInt()))

/** Replies read `Code: 60. DB::Exception: <detail>. (UNKNOWN_TABLE) (version 24.8.1.2 (official build))`. */
const codePrefix = /^Code:\s*(\d+)\.\s*(?:DB::Exception:\s*)?/
const versionSuffix = /\s*\(version [^()]*(?:\([^()]*\))?\)\s*$/
const nameSuffix = /\s*\(([A-Z][A-Z0-9_]*)\)\s*$/

const parse = (text: string) => {
  const prefix = codePrefix.exec(text)
  const rest = text.slice(prefix?.[0].length ?? 0).replace(versionSuffix, "")
  const name = nameSuffix.exec(rest)
  return { code: prefix?.[1], name: name?.[1] ?? null, detail: rest.slice(0, name?.index ?? rest.length).replace(/\.$/, "") }
}

const shorten = (text: string): string => (text.length > MaxDetailLength ? `${text.slice(0, MaxDetailLength)}…` : text)

interface Failure {
  readonly status: number
  readonly codeHeader: string | null
  readonly body: string
  /** The login, which ClickHouse puts in front of some messages (`agent: Cannot execute query ...`). */
  readonly user: string
  readonly timeoutSeconds: number
}

export const clickHouseError = ({ status, codeHeader, body, user, timeoutSeconds }: Failure): ClickHouseError => {
  const text = body.slice(0, MaxBodyLength).trim()
  const { code: bodyCode, name, detail: raw } = parse(text)
  const code = Option.getOrNull(decodeCode(codeHeader ?? bodyCode))
  const detail = shorten(raw.startsWith(`${user}: `) ? raw.slice(user.length + 2) : raw)
  const label = `ClickHouse error ${code ?? `HTTP ${status}`}${name === null ? "" : ` (${name})`}`
  if (code !== null && authenticationCodes.has(code)) {
    return new ClickHouseError({ code, message: `${label}: the server rejected the login in the connection secret` })
  }
  if (code === Readonly) {
    return new ClickHouseError({ code, message: `${label}: refused in read-only mode: ${detail}` })
  }
  if (code === TimeoutExceeded) {
    return new ClickHouseError({ code, message: `${label}: the statement ran longer than ${timeoutSeconds}s` })
  }
  return new ClickHouseError({ code, message: `${label}: ${detail}` })
}
