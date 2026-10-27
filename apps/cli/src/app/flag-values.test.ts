import { DateTime, Duration, Option, Schema } from "effect"
import { ApiMethod } from "@pc/domain"
import { describe, expect, it } from "vitest"
import { CommaList, parseDays, parseMoment, parseSpan } from "./flag-values"

const now = DateTime.makeUnsafe("2026-10-17T12:00:00Z")
const iso = (value: Option.Option<DateTime.Utc>) => Option.map(value, DateTime.formatIso)

describe("flag values", () => {
  it("reads spans", () => {
    expect(Option.map(parseSpan("30d"), Duration.toDays)).toEqual(Option.some(30))
    expect(Option.map(parseSpan("2w"), Duration.toDays)).toEqual(Option.some(14))
    expect(Option.map(parseSpan("12h"), Duration.toHours)).toEqual(Option.some(12))
    expect(parseSpan("30")).toEqual(Option.none())
    expect(parseSpan("1y")).toEqual(Option.none())
  })

  it("reads moments ahead, ago and absolute", () => {
    expect(iso(parseMoment("1d", now))).toEqual(Option.some("2026-10-18T12:00:00.000Z"))
    expect(iso(parseMoment("7d", now, "ago"))).toEqual(Option.some("2026-10-10T12:00:00.000Z"))
    expect(iso(parseMoment("2026-12-31", now))).toEqual(Option.some("2026-12-31T00:00:00.000Z"))
    expect(parseMoment("tomorrow", now)).toEqual(Option.none())
  })

  it("reads token lifetimes in whole days", () => {
    expect(parseDays("30")).toEqual(Option.some(30))
    expect(parseDays("2w")).toEqual(Option.some(14))
    expect(parseDays("12h")).toEqual(Option.none())
  })

  it("splits and checks comma lists", () => {
    const methods = Schema.decodeUnknownSync(CommaList(ApiMethod))
    expect(methods("GET, POST")).toEqual(["GET", "POST"])
    expect(() => methods("GET,FETCH")).toThrow()
    expect(() => methods(" , ")).toThrow()
  })
})
