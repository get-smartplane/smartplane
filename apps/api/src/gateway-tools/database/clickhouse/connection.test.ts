import { assert, describe, it } from "@effect/vitest"
import { Option, Redacted, Schema } from "effect"
import { ClickHouseConnection } from "./connection"

const decode = Schema.decodeUnknownOption(ClickHouseConnection)

const endpoint = (raw: string) => {
  const decoded = decode(raw)
  if (Option.isNone(decoded)) return assert.fail(`expected ${raw} to decode`)
  const { password, ...rest } = decoded.value
  return { ...rest, password: Redacted.value(password) }
}

describe("ClickHouse connection string", () => {
  it("reads https URLs, keeping the password out of the request URL", () => {
    assert.deepStrictEqual(endpoint("https://agent:s%40cret@ch.example.com:8443/analytics"), {
      url: "https://ch.example.com:8443/",
      user: "agent",
      password: "s@cret",
      database: "analytics"
    })
  })

  it("maps clickhouse:// to HTTPS on 8443 and defaults the user and database", () => {
    assert.deepStrictEqual(endpoint("clickhouse://ch.example.com"), { url: "https://ch.example.com:8443/", user: "default", password: "", database: "" })
    assert.strictEqual(endpoint("clickhouse://u:p@ch.example.com:9443/db").url, "https://ch.example.com:9443/")
    assert.strictEqual(endpoint("https://u:p@ch.example.com/db").url, "https://ch.example.com/")
  })

  it("accepts plain http only on loopback, so a password never crosses the network in clear", () => {
    assert.strictEqual(endpoint("http://u:p@127.0.0.1:8123/db").url, "http://127.0.0.1:8123/")
    for (const raw of ["http://u:p@ch.example.com:8123/db", "ftp://u:p@ch.example.com/db", "postgres://u:p@db/app", "not a url", ""]) {
      assert.isTrue(Option.isNone(decode(raw)), raw)
    }
  })

  it("round-trips through encode", () => {
    const raw = "https://agent:pw@ch.example.com:8443/analytics"
    const decoded = Schema.decodeUnknownSync(ClickHouseConnection)(raw)
    assert.strictEqual(Schema.encodeSync(ClickHouseConnection)(decoded), raw)
  })
})
