import { DateTime } from "effect"

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const units: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000]
]

export const formatDateTime = (value: DateTime.DateTime) => dateTime.format(DateTime.toDate(value))

export const formatDate = (value: DateTime.DateTime) => date.format(DateTime.toDate(value))

/** "3 hours ago", "in 2 days"; falls back to "just now" under a minute. */
export const formatRelative = (value: DateTime.DateTime) => {
  const delta = DateTime.toEpochMillis(value) - Date.now()
  for (const [unit, size] of units) {
    if (Math.abs(delta) >= size) return relative.format(Math.round(delta / size), unit)
  }
  return "just now"
}

export const isPast = (value: DateTime.DateTime) => DateTime.toEpochMillis(value) < Date.now()

export const formatPercent = (value: number) => `${Math.round(value * 100)}%`
