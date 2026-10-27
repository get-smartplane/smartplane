import { Result } from "effect"
import { describe, expect, it } from "vitest"
import { clients, type McpClient } from "./clients"
import { unifiedDiff } from "../../app/diff"
import { mergeServer } from "./merge"

const url = "https://app.smartplane.dev/mcp"

const mergeFor = (client: McpClient, existing: string | undefined, token?: string) =>
  mergeServer(existing, {
    path: "config.json",
    serversKey: client.serversKey,
    name: "smartplane",
    entry: client.entry(url, token === undefined ? { type: "oauth" } : { type: "token", token })
  })

const success = <A, E>(result: Result.Result<A, E>): A => {
  if (Result.isFailure(result)) throw new Error("expected success")
  return result.success
}

describe.each(clients.map((client) => [client.id, client] as const))("merging into %s config", (_, client) => {
  const other = { command: "uvx", args: ["other-server"] }
  const existing = JSON.stringify({ theme: "dark", [client.serversKey]: { other } })

  it("creates the file when there is none", () => {
    const merged = success(mergeFor(client, undefined))
    expect(merged.change).toBe("added")
    expect(JSON.parse(merged.text)[client.serversKey].smartplane).toEqual(client.entry(url, { type: "oauth" }))
  })

  it("keeps other servers and settings", () => {
    const merged = success(mergeFor(client, existing))
    const config = JSON.parse(merged.text)
    expect(config.theme).toBe("dark")
    expect(config[client.serversKey].other).toEqual(other)
    expect(Object.keys(config[client.serversKey])).toEqual(["other", "smartplane"])
  })

  it("is idempotent, and replaces only its own entry", () => {
    const once = success(mergeFor(client, existing))
    expect(success(mergeFor(client, once.text)).change).toBe("unchanged")
    const withToken = success(mergeFor(client, once.text, "pc_secret"))
    expect(withToken.change).toBe("updated")
    expect(withToken.text).toContain("pc_secret")
    expect(JSON.parse(withToken.text)[client.serversKey].other).toEqual(other)
  })

  it("refuses files it cannot rewrite faithfully", () => {
    expect(Result.isFailure(mergeFor(client, `{ // comment\n "${client.serversKey}": {} }`))).toBe(true)
    expect(Result.isFailure(mergeFor(client, "[1, 2]"))).toBe(true)
    expect(Result.isFailure(mergeFor(client, JSON.stringify({ [client.serversKey]: ["not", "an", "object"] })))).toBe(true)
  })
})

describe("client entries", () => {
  it("never puts a token in an OAuth entry, and keeps Claude Desktop's token out of argv", () => {
    for (const client of clients) expect(JSON.stringify(client.entry(url, { type: "oauth" }))).not.toContain("Bearer")
    const desktop = clients.find((client) => client.id === "claude-desktop")
    expect(JSON.stringify(desktop?.entry(url, { type: "token", token: "pc_x" }).args)).not.toContain("pc_x")
  })
})

describe("unifiedDiff", () => {
  it("shows removed and added lines with context", () => {
    const diff = unifiedDiff("f.json", "a\nb\nc\n", "a\nB\nc\n")
    expect(diff.split("\n")).toEqual(["--- f.json", "+++ f.json", " a", "-b", "+B", " c"])
  })

  it("is empty when nothing changes", () => {
    expect(unifiedDiff("f.json", "a\n", "a\n")).toBe("")
  })
})
