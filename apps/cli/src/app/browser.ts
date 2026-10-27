import { Effect } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { Host } from "./host"

/** Best effort: a headless box or a missing opener just means the URL stays printed. */
export const openBrowser = (url: string) =>
  Effect.gen(function*() {
    const { platform } = yield* Host
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const command = platform === "darwin"
      ? ChildProcess.make("open", [url])
      : platform === "win32"
      ? ChildProcess.make("cmd", ["/c", "start", "", url])
      : ChildProcess.make("xdg-open", [url], { stdout: "ignore", stderr: "ignore" })
    yield* spawner.exitCode(command)
  }).pipe(Effect.timeout("3 seconds"), Effect.ignore)
