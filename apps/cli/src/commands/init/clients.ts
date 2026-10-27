import { Effect, Option, Result } from "effect"
import type { Choice, Questions } from "../../app/ask"
import { indented, unifiedDiff } from "../../app/diff"
import { note } from "../../app/output"
import { clients, type McpClient, serverName } from "../connect/clients"
import { readClientConfig, writeClientConfig } from "../connect/config-file"
import { type ClientId, detectClients } from "./detect"
import { type ClientChange, step, type Step } from "./report"

export interface ClientFlags {
  readonly clients: Option.Option<ReadonlyArray<ClientId>>
  /** Clients that have both (Cursor): write the project's config instead of the user's. */
  readonly local: boolean
}

const oauth = { type: "oauth" } as const

/** The client's current entry against the one init would write; OAuth only, so no token ever lands in a file. */
const stateOf = (client: McpClient, url: string, local: boolean) =>
  Effect.gen(function*() {
    const config = yield* readClientConfig(client, { local, file: Option.none(), name: serverName })
    return { client, ...config, merged: config.merge(url, oauth) }
  })

/** Connects the chosen clients with the same merge as `smartplane connect`: other servers and settings stay. */
export const connectClients = (q: Questions, url: string, flags: ClientFlags) =>
  Effect.gen(function*() {
    const detected = yield* detectClients
    const states = yield* Effect.forEach(clients, (client) => stateOf(client, url, flags.local && client.id === "cursor"))
    const connected = states.filter((state) => Result.isSuccess(state.merged) && state.merged.success.change === "unchanged")
    for (const state of connected) yield* note(`= ${state.client.label}: already connected (${state.path}).`)
    // Once something is connected, a re-run offers only clients that look installed; `--clients` still forces any.
    const missing = states.filter((state) => !connected.includes(state) && (connected.length === 0 || detected[state.client.id] || Option.isSome(flags.clients)))
    const choices: ReadonlyArray<Choice<ClientId>> = missing.map((state) => ({
      title: `${state.client.label}${detected[state.client.id] ? "" : " (not detected)"}`,
      value: state.client.id,
      selected: detected[state.client.id]
    }))
    const chosen = Option.isSome(flags.clients)
      ? flags.clients.value.filter((id) => missing.some((state) => state.client.id === id))
      : missing.length === 0 ? [] : yield* q.multiSelect("clients", "Connect which clients? They sign in with OAuth; no token is written.", choices)
    const cursorLocal = flags.local || (chosen.includes("cursor") && q.live &&
      (yield* q.select("cursor-scope", "Cursor: for all your projects, or only this one?", [
        { title: "All projects (~/.cursor/mcp.json)", value: false, selected: true },
        { title: "Only this project (./.cursor/mcp.json)", value: true }
      ])))
    const changes: Array<ClientChange> = connected.map((state) => ({ client: state.client.id, path: state.path, change: "unchanged" }))
    for (const planned of missing.filter((state) => chosen.includes(state.client.id))) {
      const id = planned.client.id
      // The Cursor scope may have been picked after planning; the other clients have one config file each.
      const state = id === "cursor" && cursorLocal !== flags.local ? yield* stateOf(planned.client, url, cursorLocal) : planned
      if (Result.isFailure(state.merged)) {
        yield* note(`✗ ${state.client.label}: ${state.merged.failure.message}`)
        changes.push({ client: id, path: state.path, change: "refused" })
        continue
      }
      const { change, text } = state.merged.success
      if (change !== "unchanged") {
        yield* note(`✓ ${state.client.label}: ${change} "${serverName}" in ${state.path}\n${indented(unifiedDiff(state.path, state.existing ?? "", text))}`)
        yield* writeClientConfig(state.path, text)
      }
      changes.push({ client: id, path: state.path, change })
    }
    return { changes, step: clientsStep(changes) }
  })

const clientsStep = (changes: ReadonlyArray<ClientChange>): Step => {
  if (changes.length === 0) return step("clients", "skipped", "no client chosen; run `smartplane connect <client>` later")
  const label = (id: string) => clients.find((client) => client.id === id)?.label ?? id
  const detail = changes.map((change) => `${label(change.client)}: ${change.change === "unchanged" ? "already connected" : change.change}`).join("; ")
  if (changes.some((change) => change.change === "refused")) return step("clients", "failed", detail)
  return step("clients", changes.every((change) => change.change === "unchanged") ? "unchanged" : "done", detail)
}
