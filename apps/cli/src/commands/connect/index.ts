import { Effect, FileSystem, Option, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { currentTarget } from "../../api/session"
import { Host } from "../../app/host"
import { emit, note } from "../../app/output"
import { credentialsMode } from "../../config/credentials"
import { clients, type McpAuth, type McpClient, serverName } from "./clients"
import { unifiedDiff } from "../../app/diff"
import { readClientConfig, writeClientConfig } from "./config-file"
import { describeSnippets, Snippet, snippets } from "./snippets"
import { mintClientToken, placeholderAuth } from "./token"
import { connectSkills } from "./skills-hook"
import { SyncReport } from "../../skills/sync"
import { usageFailure } from "../../app/failure"

const flags = {
  client: Argument.Literals("client", ["claude-code", "cursor", "vscode", "claude-desktop", "print"]),
  token: Flag.Boolean("token").pipe(Flag.withDescription("Embed a new access token instead of signing in with OAuth"), Flag.withDefault(false)),
  ttl: Flag.String("ttl").pipe(Flag.withDescription("Lifetime of the --token token"), Flag.withDefault("90d")),
  name: Flag.String("name").pipe(Flag.withDescription("Server name in the client config"), Flag.withDefault(serverName)),
  dryRun: Flag.Boolean("dry-run").pipe(Flag.withDescription("Show the change as a diff without writing"), Flag.withDefault(false)),
  local: Flag.Boolean("local").pipe(Flag.withDescription("Cursor: write ./.cursor/mcp.json instead of ~/.cursor/mcp.json"), Flag.withDefault(false)),
  file: Flag.String("file").pipe(Flag.withDescription("Write this config file instead of the client's default"), Flag.optional),
  syncSkills: Flag.Boolean("sync-skills").pipe(Flag.withDescription("Claude Code: also sync skills to .claude/skills and add a SessionStart hook that re-syncs"), Flag.withDefault(false)),
  noHook: Flag.Boolean("no-hook").pipe(Flag.withDescription("With --sync-skills: sync once, without the hook"), Flag.withDefault(false))
}
type Input = Command.Command.Config.Infer<typeof flags>

const ConnectResult = Schema.Struct({
  client: Schema.String,
  path: Schema.String,
  server: Schema.String,
  url: Schema.String,
  auth: Schema.Literals(["oauth", "token"]),
  change: Schema.Literals(["added", "updated", "unchanged"]),
  written: Schema.Boolean,
  tokenId: Schema.NullOr(Schema.String),
  skills: Schema.NullOr(Schema.Array(SyncReport))
})

const writeConfig = (client: McpClient, url: string, input: Input) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const { existing, merge: mergeAt, path } = yield* readClientConfig(client, input)
    const merge = (auth: McpAuth) => mergeAt(url, auth)
    // Plan with a placeholder first, so a file we would refuse to touch never costs a minted token.
    const plan = yield* Effect.fromResult(merge(input.token ? placeholderAuth : { type: "oauth" }))
    const base = { client: client.id, path, server: input.name, url, auth: input.token ? "token" as const : "oauth" as const }
    if (input.dryRun) {
      yield* note(unifiedDiff(path, existing ?? "", plan.text) || `${path} already has this entry.`)
      return { ...base, change: plan.change, written: false, tokenId: null, skills: null }
    }
    const minted = input.token ? Option.some(yield* mintClientToken(client.id, input.ttl)) : Option.none()
    const merged = Option.isSome(minted) ? yield* Effect.fromResult(merge(minted.value.auth)) : plan
    yield* writeClientConfig(path, merged.text)
    if (Option.isSome(minted)) {
      yield* fs.chmod(path, credentialsMode)
      if (client.inProject(input.local)) yield* note(`${path} now holds an access token: keep it out of version control.`)
    }
    return { ...base, change: merged.change, written: true, tokenId: Option.isSome(minted) ? minted.value.tokenId : null, skills: null }
  })

const verb = { added: "Added", updated: "Updated", unchanged: "Already configured:" } as const

const summarize = (report: SyncReport) => {
  const counts = new Map<string, number>()
  for (const step of report.steps) counts.set(step.action, (counts.get(step.action) ?? 0) + 1)
  return counts.size === 0 ? "none granted" : [...counts].map(([action, count]) => `${count} ${action}`).join(", ")
}

const describeResult = (client: McpClient) => (result: typeof ConnectResult.Type) =>
  [
    result.written ? `${verb[result.change]} "${result.server}" in ${result.path}. ${client.after}` : `Dry run: ${result.path} not written.`,
    ...(result.skills ?? []).map((report) => `Skills in ${report.dir}: ${summarize(report)}`)
  ].join("\n")

export const connect = Command.make("connect", flags, (input) =>
  Effect.gen(function*() {
    const url = `${(yield* currentTarget).apiUrl}/mcp`
    const client = clients.find((candidate) => candidate.id === input.client)
    if (input.syncSkills && input.client !== "claude-code") return yield* usageFailure("--sync-skills is for claude-code; use `smartplane skills sync` for other agents.")
    if (client !== undefined) {
      const result = yield* writeConfig(client, url, input)
      const skills = input.syncSkills ? yield* connectSkills({ hook: !input.noHook, dryRun: input.dryRun }) : null
      return yield* emit(ConnectResult, { ...result, skills }, describeResult(client))
    }
    const auth = input.token && !input.dryRun ? (yield* mintClientToken("print", input.ttl)).auth : input.token ? placeholderAuth : { type: "oauth" as const }
    yield* emit(Schema.Array(Snippet), snippets(yield* Host, url, auth), describeSnippets)
  })).pipe(
    Command.withDescription("Add the Smartplane MCP server to Claude Code, Cursor, VS Code or Claude Desktop"),
    Command.withExamples([
      { command: "smartplane connect claude-code", description: "Write .mcp.json here; Claude Code signs in with OAuth" },
      { command: "smartplane connect cursor --token --dry-run", description: "Preview embedding a fresh token in ~/.cursor/mcp.json" },
      { command: "smartplane connect print", description: "Print every client's snippet" }
    ])
  )
