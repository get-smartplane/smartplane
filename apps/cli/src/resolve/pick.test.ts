import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { type Naming, pick } from "./pick"

interface Item {
  readonly id: string
  readonly name: string
}

const naming: Naming<Item> = { entity: "resource", id: (item) => item.id, names: (item) => [item.name], label: (item) => item.name }
const items: ReadonlyArray<Item> = [
  { id: "res_1", name: "github" },
  { id: "res_2", name: "GitHub-Enterprise" },
  { id: "res_3", name: "db" },
  { id: "res_4", name: "db" },
  { id: "res_5", name: "Stripe" }
]

const run = (query: string) => Effect.runSyncExit(pick(naming, query, items))
const message = (query: string) => {
  const failure = Effect.runSync(Effect.flip(pick(naming, query, items)))
  return `${failure.message}\n${failure.hint ?? ""}`
}

describe("pick", () => {
  it("takes an exact id first", () => {
    expect(run("res_3")).toEqual(Exit.succeed(items[2]))
  })

  it("prefers an exact name, then a case-insensitive one", () => {
    expect(run("github")).toEqual(Exit.succeed(items[0]))
    expect(run("stripe")).toEqual(Exit.succeed(items[4]))
  })

  it("refuses an ambiguous name and lists the candidates", () => {
    const text = message("db")
    expect(text).toContain("matches 2 resources")
    expect(text).toContain("res_3")
    expect(text).toContain("res_4")
    expect(text).toContain("Pass the id instead")
  })

  it("suggests similar names when nothing matches", () => {
    const text = message("git")
    expect(text).toContain("No resource named")
    expect(text).toContain("GitHub-Enterprise")
  })
})
