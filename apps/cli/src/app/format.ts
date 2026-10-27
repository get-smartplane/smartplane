import { DateTime } from "effect"

/** `2026-10-17 09:30Z`: minutes are enough in a terminal; `--json` keeps full precision. */
export const formatTime = (value: DateTime.Utc | null): string =>
  value === null ? "-" : `${DateTime.formatIso(value).slice(0, 16).replace("T", " ")}Z`

export const formatList = (values: ReadonlyArray<string> | undefined): string =>
  values === undefined || values.length === 0 ? "-" : values.join(",")
