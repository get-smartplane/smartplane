import { Schema } from "effect"

/** Each Worker's committed config. Its production config is written beside it (`.jsonc` → `.production.json`). */
export const configPaths = {
  api: "apps/api/wrangler.jsonc",
  web: "apps/web/wrangler.jsonc",
  integrations: "apps/integrations/wrangler.jsonc",
  "integrations-business": "apps/integrations/wrangler.business.jsonc"
} as const
export type Worker = keyof typeof configPaths

const ByBinding = Schema.Record(Schema.String, Schema.String)

const WorkerOverlay = Schema.Struct({
  name: Schema.NonEmptyString,
  routes: Schema.optionalKey(Schema.Array(Schema.Record(Schema.String, Schema.Unknown))),
  vars: Schema.optionalKey(ByBinding),
  d1: Schema.optionalKey(Schema.Record(Schema.String, Schema.Struct({ database_name: Schema.NonEmptyString, database_id: Schema.NonEmptyString }))),
  kv: Schema.optionalKey(ByBinding),
  r2: Schema.optionalKey(ByBinding),
  services: Schema.optionalKey(ByBinding)
})
type WorkerOverlay = typeof WorkerOverlay.Type

export const Overlay = Schema.Struct({
  workers: Schema.Struct({
    api: WorkerOverlay,
    web: WorkerOverlay,
    integrations: WorkerOverlay,
    "integrations-business": WorkerOverlay
  })
})
export type Overlay = typeof Overlay.Type

type Json = Record<string, unknown>
const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)
const records = (value: unknown): ReadonlyArray<Json> => (Array.isArray(value) ? value.filter(isRecord) : [])

/**
 * Every D1, KV, R2 and service binding must get its production value: a binding left as committed would make
 * Wrangler create a fresh, empty resource and point production at it.
 */
const required = (worker: Worker, kind: string, values: Readonly<Record<string, string>> | undefined, binding: unknown): string => {
  const value = typeof binding === "string" ? values?.[binding] : undefined
  if (value === undefined) throw new Error(`${worker}: no production ${kind} for binding ${String(binding)}`)
  return value
}

export const applyOverlay = (worker: Worker, base: unknown, overlay: WorkerOverlay): Json => {
  if (!isRecord(base)) throw new Error(`${worker}: config is not an object`)
  const config: Json = { ...base, name: overlay.name }
  if (overlay.routes !== undefined) config["routes"] = overlay.routes
  if (overlay.vars !== undefined) config["vars"] = { ...(isRecord(base["vars"]) ? base["vars"] : {}), ...overlay.vars }
  if ("d1_databases" in base) {
    config["d1_databases"] = records(base["d1_databases"]).map((db) => {
      const target = typeof db["binding"] === "string" ? overlay.d1?.[db["binding"]] : undefined
      if (target === undefined) throw new Error(`${worker}: no production D1 database for binding ${String(db["binding"])}`)
      return { ...db, ...target }
    })
  }
  if ("kv_namespaces" in base) {
    config["kv_namespaces"] = records(base["kv_namespaces"]).map((kv) => ({ ...kv, id: required(worker, "KV namespace id", overlay.kv, kv["binding"]) }))
  }
  if ("r2_buckets" in base) {
    config["r2_buckets"] = records(base["r2_buckets"]).map((r2) => ({ ...r2, bucket_name: required(worker, "R2 bucket", overlay.r2, r2["binding"]) }))
  }
  if ("services" in base) {
    config["services"] = records(base["services"]).map((svc) => ({ ...svc, service: required(worker, "service", overlay.services, svc["binding"]) }))
  }
  return config
}

export const decodeOverlay = Schema.decodeUnknownSync(Overlay)
