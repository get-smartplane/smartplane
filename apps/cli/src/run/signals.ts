import { EventEmitter } from "node:events"

export const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"] as const
export type ForwardedSignal = (typeof forwardedSignals)[number]

/** Where the CLI hears signals. `trap` returns a function that undoes it. */
export interface SignalSource {
  readonly trap: (handler: (signal: ForwardedSignal) => void) => () => void
}

/**
 * The process's own signals. While a child runs, the CLI is a transparent wrapper: the child decides what a
 * signal means. So the runtime's own SIGINT/SIGTERM listeners (which would interrupt the CLI and lose the
 * child's exit code) are set aside and put back afterwards.
 */
export const processSignals: SignalSource = {
  trap: (handler) => {
    const restore: Array<() => void> = []
    for (const signal of forwardedSignals) {
      const listener = () => handler(signal)
      const previous = process.listeners(signal)
      try {
        process.removeAllListeners(signal)
        process.on(signal, listener)
      } catch {
        continue // Not every signal can be listened to on every platform (Windows).
      }
      restore.push(() => {
        process.removeListener(signal, listener)
        for (const other of previous) process.on(signal, other)
      })
    }
    return () => restore.forEach((undo) => undo())
  }
}

/** For tests: `emit("SIGTERM")` stands in for a signal sent to the CLI. */
export const fakeSignals = () => {
  const emitter = new EventEmitter()
  const source: SignalSource = {
    trap: (handler) => {
      emitter.on("signal", handler)
      return () => emitter.off("signal", handler)
    }
  }
  return { source, emit: (signal: ForwardedSignal) => emitter.emit("signal", signal) }
}
