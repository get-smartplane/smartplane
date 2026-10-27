import { assert, describe, it } from "@effect/vitest"
import { candidatesFrom } from "./candidates"
import { touchedPins } from "./scan"
import { ResourceId } from "@pc/domain"

const todo = "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f"
const row = "1f2e8a4b9c3d4e5f8a7b6c5d4e3f2a1b"
const pin = { pinId: "pin_todo", label: "Todo", kind: "database", entityId: todo, children: new Set([row]) }
const repo = { pinId: "pin_repo", label: "acme/billing", kind: "repository", entityId: "acme/billing", children: new Set<string>() }

describe("touchedPins", () => {
  it("finds the pinned id dashed, dashless or inside a URL", () => {
    assert.deepStrictEqual(touchedPins({ data_source_url: `collection://${todo}` }, [pin]).map((t) => t.via), ["self"])
    assert.deepStrictEqual(touchedPins({ id: `https://www.notion.so/acme/Todo-${todo.replace(/-/g, "")}` }, [pin]).map((t) => t.via), ["self"])
  })

  it("finds a harvested child given only by id, in any spelling", () => {
    const dashed = `${row.slice(0, 8)}-${row.slice(8, 12)}-${row.slice(12, 16)}-${row.slice(16, 20)}-${row.slice(20)}`
    assert.deepStrictEqual(touchedPins({ page_id: dashed.toUpperCase(), properties: { Done: "__YES__" } }, [pin]), [{ pinId: "pin_todo", label: "Todo", kind: "database", via: "child" }])
    assert.deepStrictEqual(touchedPins({ page_ids: [row] }, [pin]).map((t) => t.via), ["child"])
  })

  it("matches a non-UUID pin as a delimited part of a path, not inside another name", () => {
    assert.strictEqual(touchedPins({ url: "https://github.com/acme/billing/pull/12" }, [repo]).length, 1)
    assert.strictEqual(touchedPins({ full_name: "acme/billing" }, [repo]).length, 1)
    assert.strictEqual(touchedPins({ full_name: "acme/billing-v2" }, [repo]).length, 0)
    assert.strictEqual(touchedPins({ full_name: "acme/billingv2" }, [repo]).length, 0)
  })

  it("ignores calls that touch neither", () => {
    assert.deepStrictEqual(touchedPins({ page_id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a" }, [pin]), [])
  })
})

describe("candidatesFrom", () => {
  it("lists named objects with ids from a search result, the closest to the rule's words first", () => {
    const result = {
      results: [
        { id: "d1", title: "Todo archive", url: "https://www.notion.so/d1", type: "database" },
        { id: todo, title: [{ plain_text: "Todo" }], url: `https://www.notion.so/${todo.replace(/-/g, "")}`, object: "database" },
        { id: "p3", title: "Meeting notes", type: "page" }
      ]
    }
    const found = candidatesFrom([result], ResourceId.make("res_notion0001"), "todo list")
    assert.deepStrictEqual(found.map((c) => [c.label, c.kind]), [["Todo", "database"], ["Todo archive", "database"]])
    assert.strictEqual(found[0]?.entityId, todo)
  })
})
