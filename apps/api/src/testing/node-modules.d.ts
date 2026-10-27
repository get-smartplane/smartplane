// Minimal declarations for the Node built-ins the test harness uses; the Worker itself never imports them.
declare module "node:sqlite" {
  export class StatementSync {
    all(...params: Array<unknown>): Array<Record<string, unknown>>
  }
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
  }
}

declare module "node:fs" {
  export function readdirSync(path: URL): Array<string>
  export function readFileSync(path: URL, encoding: "utf8"): string
}

interface ImportMeta {
  readonly url: string
}
