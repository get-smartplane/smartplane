import { describe, expect, it } from "vitest"
import { applyOverlay } from "./overlay"

const base = {
  name: "smartplane-api",
  d1_databases: [{ binding: "DB", database_name: "smartplane", migrations_dir: "migrations" }],
  kv_namespaces: [{ binding: "CACHE" }],
  r2_buckets: [{ binding: "SKILLS", bucket_name: "smartplane-skill-bundles" }],
  services: [{ binding: "RUNNER", service: "smartplane-runner" }],
  vars: { ENVIRONMENT: "production", APP_URL: "https://smartplane.example.com" }
}

const overlay = {
  name: "prod-api",
  routes: [{ pattern: "app.example.com/api/*", zone_name: "example.com" }],
  vars: { APP_URL: "https://app.example.com" },
  d1: { DB: { database_name: "prod-db", database_id: "db-id" } },
  kv: { CACHE: "kv-id" },
  r2: { SKILLS: "prod-skills" },
  services: { RUNNER: "prod-runner" }
}

describe("applyOverlay", () => {
  it("sets names, ids, routes and vars, keeping every other setting", () => {
    expect(applyOverlay("api", base, overlay)).toEqual({
      name: "prod-api",
      routes: overlay.routes,
      d1_databases: [{ binding: "DB", database_name: "prod-db", database_id: "db-id", migrations_dir: "migrations" }],
      kv_namespaces: [{ binding: "CACHE", id: "kv-id" }],
      r2_buckets: [{ binding: "SKILLS", bucket_name: "prod-skills" }],
      services: [{ binding: "RUNNER", service: "prod-runner" }],
      vars: { ENVIRONMENT: "production", APP_URL: "https://app.example.com" }
    })
  })

  it("refuses a binding without a production value, which would deploy against a fresh empty resource", () => {
    expect(() => applyOverlay("api", base, { ...overlay, kv: {} })).toThrow("no production KV namespace id for binding CACHE")
    expect(() => applyOverlay("api", base, { ...overlay, d1: {} })).toThrow("no production D1 database for binding DB")
    expect(() => applyOverlay("api", base, { name: "prod-api" })).toThrow()
  })
})
