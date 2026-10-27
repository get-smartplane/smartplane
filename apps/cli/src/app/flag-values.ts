import { DateTime, Duration, Option, Schema, SchemaTransformation } from "effect"

const splitComma = SchemaTransformation.transform<ReadonlyArray<string>, string>({
  decode: (text) => text.split(",").map((part) => part.trim()).filter((part) => part.length > 0),
  encode: (parts) => parts.join(",")
})

/** `--tools a,b,c`: a comma-separated flag value checked item by item against a domain schema. */
export const CommaList = <S extends Schema.Top>(item: S) =>
  Schema.String.pipe(
    Schema.decodeTo(Schema.Array(Schema.String), splitComma),
    Schema.decodeTo(Schema.NonEmptyArray(item))
  )

const units: Record<string, (amount: number) => Duration.Duration> = {
  m: Duration.minutes,
  h: Duration.hours,
  d: Duration.days,
  w: Duration.weeks
}

/** `30d`, `12h`, `2w`, `90m`: a span of time from now. */
export const parseSpan = (text: string): Option.Option<Duration.Duration> => {
  const match = /^(\d{1,5})([mhdw])$/.exec(text.trim())
  const unit = match?.[2] === undefined ? undefined : units[match[2]]
  return match?.[1] === undefined || unit === undefined ? Option.none() : Option.some(unit(Number(match[1])))
}

/**
 * A span relative to `now` (`30d` ahead for expiries, `7d` ago for audit ranges), or an absolute ISO date or
 * date-time (`2026-12-31`, `2026-12-31T18:00:00Z`).
 */
export const parseMoment = (text: string, now: DateTime.Utc, direction: "ahead" | "ago" = "ahead"): Option.Option<DateTime.Utc> =>
  Option.match(parseSpan(text), {
    onSome: (span) => Option.some(direction === "ahead" ? DateTime.addDuration(now, span) : DateTime.subtractDuration(now, span)),
    onNone: () => (/^\d{4}-\d{2}-\d{2}/.test(text) ? DateTime.make(text).pipe(Option.map(DateTime.toUtc)) : Option.none())
  })

/** Token lifetimes are whole days: `30d`, `2w` or a bare `30`. */
export const parseDays = (text: string): Option.Option<number> => {
  if (/^\d{1,3}$/.test(text.trim())) return Option.some(Number(text.trim()))
  return parseSpan(text).pipe(
    Option.map((span) => Duration.toDays(span)),
    Option.filter((days) => Number.isInteger(days))
  )
}
