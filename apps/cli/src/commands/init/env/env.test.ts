import { Option } from "effect"
import { describe, expect, it } from "vitest"
import { patchPackageScripts } from "../package-scripts"
import { classify, maskedPreview } from "./classify"
import { parseDotenv } from "./parse"

describe("parseDotenv", () => {
  it("reads the forms dotenv parsers agree on", () => {
    const text = [
      "# comment",
      "export PLAIN=value # trailing comment",
      "SINGLE='it is #not a comment'",
      "DOUBLE=\"line1\\nline2\"",
      "MULTI=\"first",
      "second\"",
      "TICKS=`a 'b' \"c\"`",
      "EMPTY=",
      "not a line",
      ""
    ].join("\n")
    const { entries, unreadable } = parseDotenv(text)
    expect(entries.map((e) => [e.name, e.value])).toEqual([
      ["PLAIN", "value"],
      ["SINGLE", "it is #not a comment"],
      ["DOUBLE", "line1\nline2"],
      ["MULTI", "first\nsecond"],
      ["TICKS", "a 'b' \"c\""],
      ["EMPTY", ""]
    ])
    expect(unreadable).toBe(1)
  })

  it("counts an unterminated quote as unreadable instead of swallowing the rest of the file", () => {
    expect(parseDotenv("A=\"open\nB=2\n")).toEqual({ entries: [{ name: "B", value: "2", line: 2 }], unreadable: 1 })
  })
})

describe("classify", () => {
  it.each([
    ["STRIPE_SECRET_KEY", "sk_live_x", "secret", "name"],
    ["GITHUB_TOKEN", "ghp_x", "secret", "name"],
    ["OPENAI_API_KEY", "x", "secret", "name"],
    ["DB_PASSWORD", "x", "secret", "name"],
    ["SENTRY_DSN", "https://abc@o1.ingest.sentry.io/1", "secret", "name"],
    ["DATABASE_URL", "postgres://localhost/app", "secret", "connection string"],
    ["REDIS_URL", "redis://localhost:6379", "secret", "connection string"],
    ["UPSTREAM", "https://user:pass@example.test/x", "secret", "credentials in URL"],
    ["SESSION_SEED", "q8Zr2WmPa8YcEbN3dFgH4jKxQqLkT9vZ", "secret", "looks generated"],
    ["REGION", "eu-west-1", "variable", "plain value"],
    ["PORT", "3000", "variable", "plain value"],
    ["APP_URL", "https://app.example.test/some/long/path/9", "variable", "plain value"],
    ["NEXT_PUBLIC_STRIPE_KEY", "pk_test_x", "variable", "public prefix"],
    ["VITE_API_TOKEN", "x", "variable", "public prefix"]
  ] as const)("%s is a %s", (name, value, kind, reason) => {
    expect(classify(name, value)).toEqual({ kind, reason })
  })
})

describe("maskedPreview", () => {
  it("shows four characters and the length of long values, only the length of short ones", () => {
    expect(maskedPreview("sk_live_FAKE-not-a-real-key-FAKE-not-a-real-key-FAK")).toBe("sk_l…(51 chars)")
    expect(maskedPreview("eu-west-1")).toBe("…(9 chars)")
  })
})

describe("patchPackageScripts", () => {
  it("wraps dev and start, keeps other scripts, key order and indent", () => {
    const text = `{\n    "name": "app",\n    "scripts": {\n        "dev": "next dev",\n        "build": "next build",\n        "start": "next start"\n    }\n}\n`
    const patch = Option.getOrThrow(patchPackageScripts(text))
    expect(patch.scripts).toEqual(["dev", "start"])
    expect(patch.text).toBe(
      `{\n    "name": "app",\n    "scripts": {\n        "dev": "smartplane run -- next dev",\n        "build": "next build",\n        "start": "smartplane run -- next start"\n    }\n}\n`
    )
  })

  it("leaves chained commands and already wrapped scripts alone", () => {
    const patch = patchPackageScripts(JSON.stringify({ scripts: { dev: "prisma generate && next dev", start: "smartplane run -- node ." } }))
    expect(patch).toEqual(Option.none())
  })
})
