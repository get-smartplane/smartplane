import { assert, describe, it } from "@effect/vitest"
import { mergeChildren } from "./children-store"
import { harvestChildren, type KnownPin, resultValues } from "./harvest"
import { normaliseId, pinKey, uuidsIn } from "./ids"

const todo = "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f"
const docs = "3e4f5a6b-7c8d-4e0f-9a2b-3c4d5e6f7a8b"
const rowA = "1f2e8a4b-9c3d-4e5f-8a7b-6c5d4e3f2a1b"
const rowB = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d"
const user = "7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a"
const pin: KnownPin = { pinId: "pin_todo", entityId: pinKey(todo), children: new Set() }
const dashless = (id: string) => id.replace(/-/g, "")

describe("ids", () => {
  it("normalises UUIDs with and without dashes, and finds them inside URLs and prefixes", () => {
    assert.strictEqual(normaliseId(todo.toUpperCase()), dashless(todo))
    assert.strictEqual(normaliseId(dashless(todo)), dashless(todo))
    assert.deepStrictEqual(uuidsIn(`https://www.notion.so/acme/Todo-list-${dashless(todo)}?v=1`), [dashless(todo)])
    assert.strictEqual(pinKey(`collection://${todo}`), dashless(todo))
  })
})

describe("harvestChildren", () => {
  it("records rows whose parent is the pinned database, dashed or not, and nothing else", () => {
    const result = {
      results: [
        { id: rowA, parent: { database_id: dashless(todo) }, properties: { Task: "Renew passport" }, created_by: { id: user } },
        { id: rowB, parent: { database_id: todo }, properties: { Task: "Call the bank" } },
        { id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", parent: { page_id: docs }, properties: { title: "Handbook" } }
      ]
    }
    const found = harvestChildren([result], [pin], new Set())
    assert.deepStrictEqual(found.get("pin_todo"), [dashless(rowA), dashless(rowB)])
  })

  it("takes the items a call on the pin lists, even when they do not name their parent", () => {
    const result = { results: [{ url: `https://www.notion.so/${dashless(rowA)}`, Task: "Renew passport", Owner: [{ id: user }] }, { url: `https://www.notion.so/${dashless(rowB)}`, Task: "Book flights" }], has_more: false }
    assert.deepStrictEqual(harvestChildren([result], [pin], new Set()).get("pin_todo"), undefined)
    assert.deepStrictEqual(harvestChildren([result], [pin], new Set(["pin_todo"])).get("pin_todo"), [dashless(rowA), dashless(rowB)])
  })

  it("reads the UUIDs of a plain-text answer about the pin, but never people", () => {
    const text = `<database url="https://www.notion.so/${dashless(todo)}"><data-source url="collection://${rowB}">\n<page url="https://www.notion.so/${dashless(rowA)}">Renew passport</page> assigned <mention-user url="user://${user}"/>`
    const found = harvestChildren(resultValues({ content: [{ type: "text", text }] }), [pin], new Set(["pin_todo"]))
    assert.sameMembers([...(found.get("pin_todo") ?? [])], [dashless(rowA), dashless(rowB)])
  })

  it("stops at the depth limit and the size cap", () => {
    let deep: unknown = { id: rowA, parent: todo }
    for (let i = 0; i < 20; i++) deep = { wrapper: deep }
    assert.strictEqual(harvestChildren([deep], [pin], new Set()).size, 0)
    const many = { results: Array.from({ length: 50 }, (_, i) => ({ id: `ENG-${1000 + i}`, project: todo })) }
    assert.strictEqual(harvestChildren([many], [pin], new Set(), { maxDepth: 10, maxChildren: 7 }).get("pin_todo")?.length, 7)
  })

  it("keeps only ids: titles, contents and short numbers never come out", () => {
    const result = { results: [{ id: rowA, number: 7, parent: { database_id: todo }, title: "Secret plan", content: "the launch date is 3 May" }] }
    const ids = harvestChildren([result], [pin], new Set(["pin_todo"])).get("pin_todo") ?? []
    assert.deepStrictEqual(ids, [dashless(rowA)])
    assert.notInclude(JSON.stringify(ids), "Secret")
  })

  it("caps what is kept per pin, newest last", () => {
    assert.strictEqual(mergeChildren(["a"], ["a"]), undefined)
    assert.deepStrictEqual(mergeChildren(["a", "b", "c"], ["d", "e"], 3), ["c", "d", "e"])
  })
})
