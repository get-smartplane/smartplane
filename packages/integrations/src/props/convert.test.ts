import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import type { PieceProp } from "../piece-shape"
import { makeInputValidator } from "../validation"
import { convertProps } from "./convert"

const text = (required = false, extra: Partial<PieceProp> = {}): PieceProp => ({ type: "SHORT_TEXT", displayName: "Text", required, ...extra })

describe("props to JSON Schema", () => {
  it("maps scalar props with titles, descriptions, defaults and required flags", () => {
    const { inputSchema, blocked } = convertProps({
      owner: text(true, { description: "Repository owner." }),
      body: { type: "LONG_TEXT", required: false },
      count: { type: "NUMBER", required: false, defaultValue: 30 },
      draft: { type: "CHECKBOX", required: false, defaultValue: false },
      due: { type: "DATE_TIME", required: false },
      help: { type: "MARKDOWN", required: false }
    })
    expect(blocked).toBeNull()
    expect(inputSchema).toEqual({
      type: "object",
      properties: {
        owner: { type: "string", title: "Text", description: "Repository owner." },
        body: { type: "string" },
        count: { type: "number", default: 30 },
        draft: { type: "boolean", default: false },
        due: { type: "string", format: "date-time", description: "ISO 8601 date-time." }
      },
      required: ["owner"],
      additionalProperties: false
    })
  })

  it("turns static dropdowns into enums and lists non-primitive choices instead", () => {
    const options = { options: [{ label: "Open", value: "open" }, { label: "Closed", value: "closed" }] }
    const { inputSchema } = convertProps({
      state: { type: "STATIC_DROPDOWN", options },
      states: { type: "STATIC_MULTI_SELECT_DROPDOWN", options },
      repo: { type: "STATIC_DROPDOWN", options: { options: [{ label: "A", value: { owner: "a" } }] } }
    })
    expect(inputSchema.properties).toEqual({
      state: { type: "string", enum: ["open", "closed"] },
      states: { type: "array", items: { type: "string", enum: ["open", "closed"] } },
      repo: { description: "Choices: A = {\"owner\":\"a\"}." }
    })
  })

  it("keeps dynamic inputs open and says how to fill them", () => {
    const converted = convertProps({
      repository: { type: "DROPDOWN", required: true, refreshers: ["auth"] },
      labels: { type: "MULTI_SELECT_DROPDOWN" },
      body: { type: "DYNAMIC", refreshers: ["body_type"] }
    })
    expect(converted.dynamicInputs).toEqual(["repository", "labels", "body"])
    expect(converted.inputSchema.properties).toMatchObject({
      repository: { description: expect.stringContaining("from auth") },
      labels: { type: "array" },
      body: { type: "object", description: "Its fields depend on body_type." }
    })
  })

  it("describes arrays of text or of objects with their own fields", () => {
    const { inputSchema } = convertProps({
      labels: { type: "ARRAY" },
      rows: { type: "ARRAY", properties: { name: text(true), qty: { type: "NUMBER" } } }
    })
    expect(inputSchema.properties).toEqual({
      labels: { type: "array", items: { type: "string" } },
      rows: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string", title: "Text" }, qty: { type: "number" } }, required: ["name"], additionalProperties: false }
      }
    })
  })

  it("blocks an action on a required file or unknown input, and drops optional ones", () => {
    expect(convertProps({ file: { type: "FILE", required: true } }).blocked).toContain("file")
    expect(convertProps({ x: { type: "HOLOGRAM", required: true } }).blocked).toContain("HOLOGRAM")
    const optional = convertProps({ text: text(), file: { type: "FILE" }, x: { type: "HOLOGRAM" } })
    expect([optional.blocked, Object.keys(optional.inputSchema.properties ?? {})]).toEqual([null, ["text"]])
  })

  it.effect("produces schemas the runtime validator compiles and enforces", () =>
    Effect.gen(function*() {
      const { inputSchema } = convertProps({
        owner: text(true),
        state: { type: "STATIC_DROPDOWN", options: { options: [{ label: "Open", value: "open" }] } },
        repository: { type: "DROPDOWN" },
        due: { type: "DATE_TIME" },
        tags: { type: "ARRAY" },
        payload: { type: "JSON" }
      })
      const validate = makeInputValidator("action", inputSchema)
      const ok = yield* validate({ owner: "acme", state: "open", repository: { id: 1 }, tags: ["a"], payload: [1, { b: 2 }] })
      expect(ok).toEqual({ owner: "acme", state: "open", repository: { id: 1 }, tags: ["a"], payload: [1, { b: 2 }] })
      for (const bad of [{}, { owner: 1 }, { owner: "a", state: "closed" }, { owner: "a", extra: true }, { owner: "a", tags: [1] }]) {
        const error = yield* Effect.flip(validate(bad))
        expect(error._tag, JSON.stringify(bad)).toBe("InvalidInput")
      }
    }))
})
