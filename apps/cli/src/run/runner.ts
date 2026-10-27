import { type ChildProcess, spawn, type StdioOptions } from "node:child_process"
import { constants } from "node:os"
import type { Readable, Writable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { Context, Effect, Layer } from "effect"
import { ChildExit } from "../app/child-exit"
import type { ScrubPattern } from "../scrub/patterns"
import { scrubStream } from "../scrub/scrubber"
import { type ForwardedSignal, processSignals, type SignalSource } from "./signals"

export interface ChildSpec {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly env: Readonly<Record<string, string>>
  /** Patterns to scrub from stdout and stderr; none means the child gets our stdio as is (keeping a TTY). */
  readonly scrub: ReadonlyArray<ScrubPattern>
}

export interface RunnerIo {
  /** `inherit` hands our stdin to the child; a stream is copied into a pipe (tests). */
  readonly stdin: "inherit" | Readable
  readonly stdout: Writable
  readonly stderr: Writable
  /** Real process streams can be inherited by the child; in-memory test streams must be copied. */
  readonly inheritable: boolean
  readonly stdinIsTerminal: boolean
  readonly signals: SignalSource
}

/**
 * In a terminal, Ctrl-C and Ctrl-\ already reach the child, which shares our foreground process group.
 * Forwarding them as well would deliver them twice, and many programs treat a second SIGINT as "force quit".
 */
const keyboardSignals: ReadonlyArray<ForwardedSignal> = ["SIGINT", "SIGQUIT"]

const exitCodeOf = (code: number | null, signal: NodeJS.Signals | null) =>
  code ?? (signal === null ? 1 : 128 + (constants.signals[signal] ?? 0))

const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "unknown error"

const startFailure = (command: string, error: unknown) =>
  errorCode(error) === "ENOENT"
    ? new ChildExit({ code: 127, detail: `command not found: ${command}` })
    : new ChildExit({ code: 126, detail: `could not start ${command}: ${errorCode(error)}` })

/** Copies one child stream to ours, through the scrubber when there is something to scrub. */
const copy = async (from: Readable, to: Writable, scrub: ReadonlyArray<ScrubPattern>) => {
  // A closed destination (`| head`) destroys the source too, so the child sees EPIPE as it would without us.
  await (scrub.length > 0 ? pipeline(from, scrubStream(scrub), to, { end: false }) : pipeline(from, to, { end: false })).catch(() => undefined)
  // Writes to a pipe can be asynchronous (macOS); an empty write calls back once everything before it is out.
  await new Promise<void>((resolve) => (to.writable ? to.write(Buffer.alloc(0), () => resolve()) : resolve()))
}

const runChild = (io: RunnerIo, spec: ChildSpec) =>
  Effect.callback<number, ChildExit>((resume) => {
    const piped = spec.scrub.length > 0 || !io.inheritable
    const stdio: StdioOptions = [io.stdin === "inherit" ? "inherit" : "pipe", piped ? "pipe" : "inherit", piped ? "pipe" : "inherit"]
    let settled = false
    let release = () => {}
    const settle = (result: Effect.Effect<number, ChildExit>) => {
      if (settled) return
      settled = true
      release()
      resume(result)
    }
    let child: ChildProcess
    try {
      child = spawn(spec.command, [...spec.args], { env: spec.env, stdio })
    } catch (error) {
      settle(Effect.fail(startFailure(spec.command, error)))
      return
    }
    if (io.stdin !== "inherit" && child.stdin !== null) {
      child.stdin.on("error", () => undefined) // the child may exit without reading its input
      io.stdin.pipe(child.stdin)
    }
    const copies = piped && child.stdout !== null && child.stderr !== null
      ? [copy(child.stdout, io.stdout, spec.scrub), copy(child.stderr, io.stderr, spec.scrub)]
      : []
    release = io.signals.trap((signal) => {
      if (io.stdinIsTerminal && keyboardSignals.includes(signal)) return
      if (child.exitCode === null && child.signalCode === null) child.kill(signal)
    })
    child.once("error", (error) => settle(Effect.fail(startFailure(spec.command, error))))
    child.once("close", (code, signal) => {
      void Promise.all(copies).then(() => settle(Effect.succeed(exitCodeOf(code, signal))))
    })
    return Effect.sync(() => {
      release()
      if (child.exitCode === null) child.kill("SIGTERM")
    })
  })

/** Starts the program `smartplane run` wraps and reports how it ended. */
export class ChildRunner extends Context.Service<ChildRunner, {
  readonly run: (spec: ChildSpec) => Effect.Effect<number, ChildExit>
}>()("@pc/cli/ChildRunner") {
  static readonly layerWith = (io: RunnerIo) =>
    Layer.succeed(ChildRunner, ChildRunner.of({ run: (spec) => runChild(io, spec) }))

  static readonly layer = Layer.suspend(() =>
    ChildRunner.layerWith({
      stdin: "inherit",
      stdout: process.stdout,
      stderr: process.stderr,
      inheritable: true,
      stdinIsTerminal: process.stdin.isTTY === true,
      signals: processSignals
    })
  )
}
