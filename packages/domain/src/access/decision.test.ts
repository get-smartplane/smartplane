import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Decision } from "./decision"

const codec = Schema.toCodecJson(Decision)

describe("Decision", () => {
  it("round-trips every case", () => {
    const cases = [
      { _tag: "Allow", flaggedBy: ["grd_abcdefgh"] },
      { _tag: "Deny", reasons: [{ _tag: "GuardUnavailable", guardId: "grd_abcdefgh" }] },
      { _tag: "Deny", reasons: [{ _tag: "UnknownTool", tool: "nope__x" }] },
      { _tag: "PendingApproval", approvalId: "apr_abcdefgh", guardId: "grd_abcdefgh" }
    ]
    for (const encoded of cases) {
      expect(Schema.encodeSync(codec)(Schema.decodeUnknownSync(codec)(encoded))).toEqual(encoded)
    }
  })

  it("requires at least one deny reason, each with its fields", () => {
    expect(() => Schema.decodeUnknownSync(codec)({ _tag: "Deny", reasons: [] })).toThrow()
    // What the gateway used to record for unknown tools; it must not pass as a `NoGrant`.
    expect(() => Schema.decodeUnknownSync(codec)({ _tag: "Deny", reasons: [{ _tag: "NoGrant" }] })).toThrow()
  })

  it("matches exhaustively on the tag", () => {
    const describe = Decision.match({
      Allow: () => "allow",
      Deny: ({ reasons }) => `deny:${reasons[0]._tag}`,
      PendingApproval: ({ approvalId }) => `pending:${approvalId}`
    })
    const denied = Schema.decodeUnknownSync(codec)({
      _tag: "Deny",
      reasons: [{ _tag: "ToolNotAllowed", resourceId: "res_abcdefgh", tool: "drop_table" }]
    })
    expect(describe(denied)).toBe("deny:ToolNotAllowed")
  })
})
