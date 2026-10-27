import { Effect, FileSystem, Path } from "effect"
import { Host } from "../../app/host"
import { claudeDesktopConfigPath, pathJoin } from "../../config/paths"
import type { McpClient } from "../connect/clients"

export type ClientId = McpClient["id"]

/** VS Code's per-user settings folder on each OS. */
const vscodeUserDir = (host: Host["Service"]) => {
  switch (host.platform) {
    case "darwin":
      return pathJoin(host.platform, host.home, "Library", "Application Support", "Code", "User")
    case "win32":
      return pathJoin(host.platform, host.env("APPDATA") ?? pathJoin(host.platform, host.home, "AppData", "Roaming"), "Code", "User")
    case "linux":
      return pathJoin(host.platform, host.env("XDG_CONFIG_HOME") ?? pathJoin(host.platform, host.home, ".config"), "Code", "User")
  }
}

/**
 * Which MCP clients look installed: a binary on PATH or the folder the client keeps its settings in. Only
 * used to preselect choices, so a miss costs a click, never a wrong write.
 */
export const detectClients = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const host = yield* Host
  const exists = (file: string) => fs.exists(file).pipe(Effect.orElseSucceed(() => false))
  const dirs = (host.env("PATH") ?? "").split(host.platform === "win32" ? ";" : ":").filter((dir) => dir !== "")
  const suffixes = host.platform === "win32" ? [".exe", ".cmd", ".bat"] : [""]
  const onPath = (binary: string) =>
    Effect.map(Effect.forEach(dirs.flatMap((dir) => suffixes.map((suffix) => path.join(dir, `${binary}${suffix}`))), exists), (found) => found.some(Boolean))
  const either = (...checks: ReadonlyArray<Effect.Effect<boolean>>) => Effect.map(Effect.all(checks), (found) => found.some(Boolean))
  const detected: Record<ClientId, boolean> = {
    "claude-code": yield* either(onPath("claude"), exists(path.join(host.home, ".claude"))),
    cursor: yield* either(onPath("cursor"), exists(path.join(host.home, ".cursor"))),
    vscode: yield* either(onPath("code"), exists(vscodeUserDir(host))),
    "claude-desktop": yield* exists(path.dirname(claudeDesktopConfigPath(host)))
  }
  return detected
})
