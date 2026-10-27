import { Schema } from "effect"
import { SyncReport } from "../../skills/sync"

export const StepName = Schema.Literals(["sign-in", "project", "clients", "skills", "secrets", "verify"])
export type StepName = typeof StepName.Type

/** `unchanged`: already set up by an earlier run; `skipped`: not done this time, with the reason in `detail`. */
export const StepStatus = Schema.Literals(["done", "unchanged", "skipped", "failed"])
export type StepStatus = typeof StepStatus.Type

export const Step = Schema.Struct({ step: StepName, status: StepStatus, detail: Schema.String })
export type Step = typeof Step.Type

export const step = (name: StepName, status: StepStatus, detail: string): Step => ({ step: name, status, detail })

export const ClientChange = Schema.Struct({
  client: Schema.String,
  path: Schema.String,
  change: Schema.Literals(["added", "updated", "unchanged", "refused"])
})
export type ClientChange = typeof ClientChange.Type

export const ImportedName = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(["secret", "variable"]),
  deliverable: Schema.Boolean,
  /** The caller now holds `use` on it, so `smartplane run` delivers it to them. */
  granted: Schema.Boolean
})

export const SecretsReport = Schema.Struct({
  files: Schema.Array(Schema.Struct({ path: Schema.String, tracked: Schema.Boolean })),
  created: Schema.Array(ImportedName),
  skipped: Schema.Array(Schema.Struct({ name: Schema.String, reason: Schema.String })),
  packageScripts: Schema.Array(Schema.String)
})
export type SecretsReport = typeof SecretsReport.Type

export const emptySecrets: SecretsReport = { files: [], created: [], skipped: [], packageScripts: [] }

export const VerifyReport = Schema.Struct({
  /** Gateway tools (`<server>__<tool>`) the caller may call, not counting the built-ins everyone gets. */
  tools: Schema.Number,
  builtinTools: Schema.Number,
  /** Env names `smartplane run` would inject here; never values. */
  delivered: Schema.Array(Schema.String),
  problems: Schema.Array(Schema.String)
})
export type VerifyReport = typeof VerifyReport.Type

/** `init --json`: what each step did, without a single secret value. */
export const InitReport = Schema.Struct({
  identity: Schema.NullOr(Schema.Struct({ as: Schema.String, org: Schema.String, profile: Schema.String, apiUrl: Schema.String })),
  project: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String, file: Schema.String })),
  clients: Schema.Array(ClientChange),
  skills: Schema.Array(SyncReport),
  hook: Schema.NullOr(Schema.Literals(["added", "unchanged"])),
  secrets: SecretsReport,
  verify: Schema.NullOr(VerifyReport),
  steps: Schema.Array(Step),
  next: Schema.Array(Schema.String)
})
export type InitReport = typeof InitReport.Type

const mark: Record<StepStatus, string> = { done: "✓", unchanged: "=", skipped: "-", failed: "✗" }

export const describeReport = (report: InitReport): string =>
  [
    "smartplane init",
    ...report.steps.map((s) => `  ${mark[s.status]} ${s.step.padEnd(8)} ${s.detail}`),
    ...(report.next.length === 0 ? [] : ["", "Next:", ...report.next.map((line) => `  ${line}`)])
  ].join("\n")
