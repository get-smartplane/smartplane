import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Schema } from "effect"
import { delivered, deliveryReply } from "./delivery"
import type { RecordedRequest, Routes } from "./fake-api"
import { fakeMcp } from "./fake-mcp"
import { at, grant, me, orgId, resource } from "./fixtures"
import { type CliOptions, runCli, tempDir } from "./run-cli"

export const project = { id: "prj_api00001", orgId, name: "API", slug: "api", archivedAt: null, createdAt: at }

/** Realistic-looking values; tests assert none of them ever reaches the CLI's output. */
export const envValues = {
  STRIPE_SECRET_KEY: "sk_live_FAKE-not-a-real-key-FAKE-not-a-r",
  DATABASE_URL: "postgres://app:hunter2hunter2@db.internal:5432/app",
  SESSION_SIGNING: "q8Zr2WmPa8YcEbN3dFgH4jKxQqLkT9vZ",
  REGION: "eu-west-1-zone-b",
  VITE_PUBLIC_URL: "https://public.example.test/app"
} as const

export const dotenvText = Object.entries(envValues).map(([name, value]) => `${name}=${value}`).join("\n") + "\n"

const CreateBody = Schema.Struct({ name: Schema.String, projectId: Schema.NullOr(Schema.String), config: Schema.Record(Schema.String, Schema.Unknown) })
const DeliveryBody = Schema.Struct({ delivery: Schema.optional(Schema.String), envName: Schema.optional(Schema.NullOr(Schema.String)) })
const GrantBody = Schema.Struct({ subject: Schema.Record(Schema.String, Schema.Unknown), resourceId: Schema.String })

type WireResource = Omit<ReturnType<typeof resource>, "projectId"> & { readonly projectId: string | null }

/**
 * A small stateful org: resources created through the API are listed afterwards, so a second `init` sees
 * what the first one made. Secrets are stored without their value, like the real API.
 */
export const initWorld = (existing: ReadonlyArray<WireResource> = []) => {
  const resources: Array<WireResource> = [...existing]
  const create = (request: RecordedRequest) => {
    const body = Schema.decodeUnknownSync(CreateBody)(request.body)
    const id = `res_imported${String(resources.length).padStart(3, "0")}`
    const config = body.config["kind"] === "secret" ? { kind: "secret" } : body.config
    const created = { ...resource(id, body.name, config), projectId: body.projectId }
    resources.push(created)
    return { status: 201, body: created }
  }
  const updateDelivery = (request: RecordedRequest) => {
    const id = request.path.split("/")[3]
    const body = Schema.decodeUnknownSync(DeliveryBody)(request.body)
    const index = resources.findIndex((r) => r.id === id)
    const current = resources[index]
    if (current === undefined) return { status: 404, body: { _tag: "NotFound", entity: "resource", id: String(id) } }
    const next = { ...current, config: { ...current.config, delivery: body.delivery, envName: body.envName ?? undefined } }
    resources[index] = next
    return { body: next }
  }
  const deliverable = () =>
    resources.filter((r) => r.config["kind"] === "variable" || r.config["delivery"] === "deliverable").map((r) =>
      delivered(r.name, "delivered-value-never-printed", r.config["kind"] === "variable" ? "variable" : "secret"))
  const routes: Routes = {
    "GET /api/me": { body: me },
    "GET /api/projects": { body: [project] },
    "GET /api/resources": () => ({ body: resources }),
    "POST /api/resources": create,
    "PATCH /api/resources/:id/delivery": updateDelivery,
    "POST /api/grants": (request) => {
      const body = Schema.decodeUnknownSync(GrantBody)(request.body)
      return { status: 201, body: grant(body.subject, body.resourceId) }
    },
    "POST /api/secrets/deliver": () => deliveryReply(deliverable())
  }
  return { routes, resources }
}

export interface InitSetup {
  readonly home: string
  readonly cwd: string
  readonly world: ReturnType<typeof initWorld>
  readonly init: (args: ReadonlyArray<string>, options?: CliOptions) => ReturnType<typeof runCli>
}

/** A temp HOME with Claude Code installed and a git repository with a `.env` and a package.json. */
export const initSetup = (options: { readonly git?: boolean; readonly existing?: ReadonlyArray<WireResource> } = {}): InitSetup => {
  const home = tempDir()
  const cwd = tempDir()
  if (options.git === true) execFileSync("git", ["init", "-q"], { cwd })
  else mkdirSync(join(cwd, ".git"))
  mkdirSync(join(home, ".claude"))
  writeFileSync(join(cwd, ".env"), dotenvText)
  writeFileSync(join(cwd, "package.json"), `${JSON.stringify({ name: "app", scripts: { dev: "next dev", build: "next build" } }, null, 2)}\n`)
  const world = initWorld(options.existing)
  const { mcp } = fakeMcp(() => [{ slug: "smartplane", description: "Built in", version: "v1", files: [{ path: "SKILL.md", text: "# Working through Smartplane" }] }], {
    tools: ["github__create_issue", "github__list_issues"]
  })
  return {
    home,
    cwd,
    world,
    init: (args, extra = {}) => runCli(["init", ...args], { home, cwd, routes: world.routes, mcp, env: { SMARTPLANE_TOKEN: "pc_cli", PATH: "" }, ...extra })
  }
}
