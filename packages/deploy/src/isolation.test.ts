import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { assertIsolated, sharedNamespaces } from "./isolation"
import { decodeOverlay, type Overlay } from "./overlay"

const overlayWith = (runnerStore: string, businessStore: string): Overlay => ({
  workers: {
    api: { name: "api", kv: { CACHE: "api-cache-id" } },
    web: { name: "web" },
    integrations: { name: "runner", kv: { STORE: runnerStore } },
    "integrations-business": { name: "runner-business", kv: { STORE: businessStore } }
  }
})

describe("runner KV isolation", () => {
  it("accepts runners with their own namespace (they may share one with each other)", () => {
    expect(sharedNamespaces(overlayWith("runner-store-id", "runner-store-id"))).toEqual([])
  })

  it("refuses an overlay where a runner's STORE is the api's CACHE", () => {
    expect(() => assertIsolated(overlayWith("api-cache-id", "runner-store-id"))).toThrow("integrations: KV binding STORE uses the api's CACHE namespace")
    expect(sharedNamespaces(overlayWith("runner-store-id", "api-cache-id"))).toHaveLength(1)
  })

  it("holds for the committed example overlay", async () => {
    const example = decodeOverlay(JSON.parse(await readFile(new URL("../../../deploy/production.example.json", import.meta.url), "utf8")))
    expect(sharedNamespaces(example)).toEqual([])
  })
})
