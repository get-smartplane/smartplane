import { mkdtempSync } from "node:fs"
import { Readable, Writable } from "node:stream"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Cause, Effect, Exit, Layer, Runtime, Stdio, Stream } from "effect"
import { Host } from "../app/host"
import { Output } from "../app/output"
import { Credentials } from "../config/credentials"
import { main } from "../main"
import { ChildRunner } from "../run/runner"
import { fakeSignals, type ForwardedSignal } from "../run/signals"
import { McpConnection, type McpOptions, type McpResources } from "../skills/mcp"
import { Ask } from "../app/ask"
import { fakeApi, type RecordedRequest, type Routes } from "./fake-api"
import { builtinTools, toolList } from "./fake-mcp"

export interface CliRun {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
  readonly requests: ReadonlyArray<RecordedRequest>
  /** What a child started by `smartplane run` wrote, after scrubbing. */
  readonly childStdout: string
  readonly childStderr: string
  /** Question ids asked through `Ask`, in order (only with `answers`). */
  readonly asked: ReadonlyArray<string>
  /** Options each MCP connection was opened with (the project header). */
  readonly mcpOpened: ReadonlyArray<McpOptions>
}

export interface ChildOptions {
  /** Piped into the child's stdin. */
  readonly stdin?: string
  /** Sees the child's (scrubbed) stdout as it arrives; `signal` stands in for a signal sent to the CLI. */
  readonly onStdout?: (text: string, signal: (name: ForwardedSignal) => void) => void
}

export interface CliOptions {
  readonly routes?: Routes
  readonly env?: Readonly<Record<string, string>>
  /** Piped stdin; leave unset for an empty, non-interactive stdin. */
  readonly stdin?: string
  readonly home?: string
  readonly cwd?: string
  /** The MCP gateway as wire JSON; defaults to one serving no skills. */
  readonly mcp?: McpResources
  readonly child?: ChildOptions
  /** Simulates a person at a terminal answering by question id; unset means no terminal (nobody to ask). */
  readonly answers?: Readonly<Record<string, unknown>>
}

const collector = (chunks: Array<Buffer>, onChunk?: (text: string) => void) =>
  new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk)
      onChunk?.(chunk.toString("utf8"))
      done()
    }
  })

/** Runs children for real, with in-memory stdio and fake signals. */
const testRunner = (options: ChildOptions, stdout: Array<Buffer>, stderr: Array<Buffer>) => {
  const signals = fakeSignals()
  return ChildRunner.layerWith({
    stdin: Readable.from([Buffer.from(options.stdin ?? "")]),
    stdout: collector(stdout, (text) => options.onStdout?.(text, signals.emit)),
    stderr: collector(stderr),
    inheritable: false,
    stdinIsTerminal: false,
    signals: signals.source
  })
}

const emptyMcp: McpResources = {
  listTools: async () => toolList(builtinTools),
  listResources: async () => ({ resources: [] }),
  listPrompts: async () => ({ prompts: [] }),
  readResource: async (uri) => Promise.reject(new Error(`no resource ${uri}`))
}

export const tempDir = (prefix = "smartplane-") => mkdtempSync(join(tmpdir(), prefix))

/** Runs the real command tree against a fake API, a private HOME and captured output; never throws. */
export const runCli = async (args: ReadonlyArray<string>, options: CliOptions = {}): Promise<CliRun> => {
  const stdout: Array<string> = []
  const stderr: Array<string> = []
  const requests: Array<RecordedRequest> = []
  const asked: Array<string> = []
  const mcpOpened: Array<McpOptions> = []
  const childStdout: Array<Buffer> = []
  const childStderr: Array<Buffer> = []
  const home = options.home ?? tempDir()
  const stdio = Stdio.layerTest({
    args: Effect.succeed(args),
    stdinIsTerminal: Effect.succeed(false),
    stdin: Stream.make(new TextEncoder().encode(options.stdin ?? ""))
  })
  const host = Host.layerTest({ home, cwd: options.cwd ?? home, env: { XDG_CONFIG_HOME: join(home, ".config"), ...options.env } })
  const ask = options.answers === undefined ? Ask.layer : Ask.layerScripted(options.answers, asked)
  const layer = Layer.merge(Credentials.layer, ask).pipe(
    Layer.provideMerge(Layer.mergeAll(
      host,
      Output.layerMemory(stdout, stderr),
      fakeApi(options.routes ?? {}, requests),
      McpConnection.layerFake(options.mcp ?? emptyMcp, mcpOpened),
      testRunner(options.child ?? {}, childStdout, childStderr)
    )),
    Layer.provideMerge(Layer.merge(NodeServices.layer, stdio))
  )
  const exit = await Effect.runPromiseExit(main.pipe(Effect.provide(layer)))
  const exitCode = Exit.isSuccess(exit) ? 0 : Runtime.getErrorExitCode(Cause.squash(exit.cause))
  return {
    stdout: stdout.join("\n"),
    stderr: stderr.join("\n"),
    exitCode,
    requests,
    childStdout: Buffer.concat(childStdout).toString("utf8"),
    childStderr: Buffer.concat(childStderr).toString("utf8"),
    asked,
    mcpOpened
  }
}
