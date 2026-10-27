import { homedir } from "node:os"
import { Context, Layer } from "effect"

export type Platform = "darwin" | "linux" | "win32"

/** The machine the CLI runs on. A service so tests can point HOME, the platform and the environment anywhere. */
export class Host extends Context.Service<Host, {
  readonly platform: Platform
  readonly home: string
  readonly cwd: string
  readonly env: (name: string) => string | undefined
  /** Every variable, for building a child process's environment. */
  readonly environment: () => Readonly<Record<string, string>>
}>()("@pc/cli/Host") {
  static readonly layer = Layer.sync(Host, () =>
    Host.of({
      platform: process.platform === "darwin" || process.platform === "win32" ? process.platform : "linux",
      home: homedir(),
      cwd: process.cwd(),
      env: (name) => {
        const value = process.env[name]
        return value === undefined || value === "" ? undefined : value
      },
      environment: () => Object.fromEntries(Object.entries(process.env).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])))
    })
  )

  static readonly layerTest = (options: {
    readonly home: string
    readonly cwd?: string
    readonly platform?: Platform
    readonly env?: Readonly<Record<string, string>>
  }) =>
    Layer.succeed(Host, Host.of({
      platform: options.platform ?? "linux",
      home: options.home,
      cwd: options.cwd ?? options.home,
      env: (name) => options.env?.[name],
      environment: () => ({ ...options.env })
    }))
}
