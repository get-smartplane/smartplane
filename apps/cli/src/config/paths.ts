import type { Platform } from "../app/host"

interface PathEnv {
  readonly platform: Platform
  readonly home: string
  readonly env: (name: string) => string | undefined
}

export const pathJoin = (platform: Platform, ...parts: ReadonlyArray<string>) => parts.join(platform === "win32" ? "\\" : "/")

/** `$XDG_CONFIG_HOME/smartplane` or `~/.config/smartplane`; `%APPDATA%\smartplane` on Windows. */
export const configDir = ({ platform, home, env }: PathEnv): string => {
  if (platform === "win32") return pathJoin(platform, env("APPDATA") ?? pathJoin(platform, home, "AppData", "Roaming"), "smartplane")
  return pathJoin(platform, env("XDG_CONFIG_HOME") ?? pathJoin(platform, home, ".config"), "smartplane")
}

export const credentialsPath = (host: PathEnv): string => pathJoin(host.platform, configDir(host), "credentials.json")

/** Where Claude Desktop keeps its config on each OS. */
export const claudeDesktopConfigPath = ({ platform, home, env }: PathEnv): string => {
  switch (platform) {
    case "darwin":
      return pathJoin(platform, home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    case "win32":
      return pathJoin(platform, env("APPDATA") ?? pathJoin(platform, home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
    case "linux":
      return pathJoin(platform, env("XDG_CONFIG_HOME") ?? pathJoin(platform, home, ".config"), "Claude", "claude_desktop_config.json")
  }
}

