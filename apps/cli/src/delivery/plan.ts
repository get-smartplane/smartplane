import { EnvName } from "@pc/domain"
import { Redacted, Schema } from "effect"
import type { SecretValue } from "../scrub/patterns"
import { type DeliveredKind, type DeliveredSecrets, type DeliveryDenial, describeDenial } from "./schema"

export interface Injected {
  readonly name: string
  readonly kind: DeliveredKind | "placeholder"
  readonly value: Redacted.Redacted<string>
}

export interface InjectionPlan {
  readonly injected: ReadonlyArray<Injected>
  /** Requested names that were not delivered, including ones the server did not mention at all. */
  readonly denied: ReadonlyArray<DeliveryDenial>
  /** Secret values to scrub from the child's output. Variables are not secret and are left alone. */
  readonly secrets: ReadonlyArray<SecretValue>
  /** Names the server sent that are not safe env names (e.g. `NODE_OPTIONS`, `LD_PRELOAD`); skipped, never set. */
  readonly refused: ReadonlyArray<string>
}

/** Checked again here, not only on the server: a compromised server must not be able to set a loader variable. */
const isSafeEnvName = Schema.is(EnvName)

/** The token that fetched the values stays with the CLI; the child gets the values, not the means to fetch more. */
export const withheldVariables: ReadonlyArray<string> = ["SMARTPLANE_TOKEN"]

export const placeholder = (name: string) => `smartplane:denied:${name}`

export const planInjection = (
  response: DeliveredSecrets,
  requested: ReadonlyArray<string> | undefined,
  placeholders: boolean
): InjectionPlan => {
  const byName = new Map<string, Injected>()
  const refused = new Set<string>()
  for (const item of response.env) {
    if (!isSafeEnvName(item.name)) refused.add(item.name)
    else if (!byName.has(item.name)) byName.set(item.name, { name: item.name, kind: item.kind, value: item.value })
  }
  const deniedByName = new Map(response.denied.map((entry) => [entry.name, entry]))
  for (const name of requested ?? []) {
    if (!byName.has(name) && !deniedByName.has(name)) deniedByName.set(name, { name, reason: "unknown" })
  }
  const denied = [...deniedByName.values()]
  if (placeholders) {
    for (const { name } of denied) if (isSafeEnvName(name)) byName.set(name, { name, kind: "placeholder", value: Redacted.make(placeholder(name)) })
  }
  const injected = [...byName.values()]
  const secrets = injected.flatMap((item) => (item.kind === "secret" ? [{ name: item.name, value: Redacted.value(item.value) }] : []))
  return { injected, denied, secrets, refused: [...refused] }
}

export const refusedNotice = (refused: ReadonlyArray<string>) =>
  `smartplane: skipped unsafe env names from the server (they change how programs load code): ${refused.join(", ")}`

export const deniedNotice = (denied: ReadonlyArray<DeliveryDenial>) =>
  `smartplane: not delivered: ${denied.map((entry) => `${entry.name} (${describeDenial[entry.reason]})`).join(", ")}`

/** The child's environment: ours, minus the withheld token, with delivered values taking precedence. */
export const mergeEnvironment = (base: Readonly<Record<string, string>>, injected: ReadonlyArray<Injected>) => {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(base)) if (!withheldVariables.includes(name)) env[name] = value
  const overridden = injected.filter((item) => env[item.name] !== undefined).map((item) => item.name)
  for (const item of injected) env[item.name] = Redacted.value(item.value)
  return { env, overridden }
}
