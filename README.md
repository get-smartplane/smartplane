# Smartplane

One MCP endpoint that gives AI agents governed access to an organisation's MCP servers, tools, skills,
databases, APIs, secrets and variables. Access follows role, team and project grants. Plain-language
guard rules are checked by a Cloudflare Clef classifier before each action. Every event goes to a
hash-chained audit log.

Conventions for contributors (human or agent) are in [CLAUDE.md](CLAUDE.md).

## Layout

| Path | What | Runs on |
|---|---|---|
| `packages/domain` | Contract: Effect schemas, branded ids, typed errors, `PrimitiveApi` HttpApi | shared |
| `apps/api` | Effect 4 Worker: HttpApi, MCP gateway, WorkOS auth + webhooks, audit queue/DO, cron | Workers, D1, KV, R2, Queues, DO, Workers AI |
| `apps/web` | Dashboard: React, TanStack Router, shadcn/ui, typed `HttpApiClient` + effect atoms | Workers static assets |
| `packages/integrations` | Curated Activepieces pieces: catalog generator, prop→JSON Schema, runner RPC contract | shared |
| `apps/integrations` | `smartplane-runner` and `smartplane-runner-business` (one runner Worker per piece shard): run piece actions for the gateway over service bindings (no public routes) | Workers, KV |

## How a tool call flows

```
MCP client ──Bearer pc_… or AuthKit OAuth JWT──▶ /mcp (apps/api)
  1. token → principal (hash lookup or JWKS-verified JWT; expiry; membership must be active)
  2. grants → which tools exist for this principal (role ∪ teams ∪ user, project-scoped), from pluggable
     providers: built-ins, upstream MCP servers, HTTP APIs (<slug>__request), databases (<slug>__query/__schema),
     integrations (<slug>__<action>, Activepieces pieces run by apps/integrations; see docs/integrations.md)
     Skills are also served as MCP prompts (slash commands) and skill:// resources; see docs/skills.md
  3. guards → each rule's scope and accepted call filter (resources, tools, operations, actors) are checked in
     code; one Clef call answers the rules left (none left: no call); fail closed; enforce / monitor / approval
  4. execution with credentials injected from envelope-encrypted secrets (MCP upstream, HTTP API, SQL connection), from
     one shared connected account or the caller's own (OAuth for upstream MCP servers included; see docs/connections.md)
  5. audit event → Queue → per-org AuditLog Durable Object → D1 (seq + sha256 chain) → nightly R2 archive
```

## Getting started

```sh
bun install

# API (http://localhost:8787)
cd apps/api
cp .dev.vars.example .dev.vars          # fill WorkOS keys; openssl rand -base64 32 for KEK / cookie password
bunx wrangler d1 migrations apply DB --local
bunx wrangler dev --local               # plain `wrangler dev` needs CLOUDFLARE_API_TOKEN for Workers AI

# Dashboard (http://localhost:5173, proxies /api /auth /mcp to :8787)
cd apps/web && bun run dev
```

Telemetry: run [Maple](https://maple.dev) locally (`maple start`) and set
`OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in `apps/api/.dev.vars`. Then use `maple traces --local`.

For a developer machine, `smartplane init` (the CLI in `apps/cli`, see [docs/cli.md](docs/cli.md)) signs in,
picks the project, connects Claude Code, Cursor, VS Code or Claude Desktop over OAuth, syncs skills, and
offers to move `.env` values into Smartplane so commands run under `smartplane run`.

Checks: `bun run typecheck` at the root, `bunx vitest run` in `packages/domain`, `packages/integrations`,
`apps/api`, `apps/integrations` and `apps/cli`.

Connections: MCP servers, APIs and integrations use one shared account (an admin connects it; grants and guards
still apply per person, and guards see the account's identity) or each member's own (`accountMode: "per_user"`).
Upstream MCP servers sign in with OAuth (discovery, dynamic registration, PKCE, resource indicators). See
[docs/connections.md](docs/connections.md).

Integrations: `bun run generate` in `packages/integrations` rebuilds the catalog after changing the curated
pieces. Run the API with the integrations Workers bound: `bunx wrangler dev -c apps/api/wrangler.jsonc -c
apps/integrations/wrangler.jsonc -c apps/integrations/wrangler.business.jsonc --local` from the root. Details, OAuth setup and licensing:
[docs/integrations.md](docs/integrations.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Secrets stay gateway-only unless an admin marks one `deliverable`; then `smartplane run -- <cmd>` (your
grants) or a deployed service's `pcm_` machine token can fetch it from `POST /api/secrets/deliver`. Audited,
guarded, rate limited. Threat model and a Railway example: [docs/secrets-delivery.md](docs/secrets-delivery.md).

## CLI

```sh
npx smartplane login                    # or: bunx smartplane, npm i -g smartplane, or a binary from apps/cli/dist/bin
npx smartplane connect claude-code      # add the gateway to .mcp.json (OAuth; --token to embed a fresh pc_ token)
npx smartplane grants add --to team:platform --resource github --level use --expires 30d
npx smartplane audit tail --follow
```

In CI, set `SMARTPLANE_TOKEN` to a service-account token instead of logging in. Build with `bun run build` in
`apps/cli` (binaries for linux, macOS and Windows plus the npm package). Every command and flag is listed in
[docs/cli.md](docs/cli.md).

## Before the first deploy

Already created: D1 `primitive-context` (migrations 0001–0003 applied), KV `primitive-context-cache`,
R2 `primitive-context-audit`; their ids are in `apps/api/wrangler.jsonc`. Still to do:

- Queues `audit-events` and `audit-events-dlq` (`wrangler queues create …`), and R2 bucket lock /
  retention on `primitive-context-audit`.
- WorkOS: AuthKit redirect URI `<API_URL>/auth/callback`, a webhook to `<API_URL>/webhooks/workos`, the
  `admin`/`member` roles; for MCP OAuth add `<API_URL>/mcp` as a resource indicator, enable dynamic client
  registration and set `WORKOS_AUTHKIT_DOMAIN`. Store secrets with `wrangler secret put`.
- Route `/api/*`, `/auth/*`, `/mcp` and `/.well-known/oauth-protected-resource*` on the dashboard hostname
  to the API worker so cookies stay same-origin.
- New migrations: `bun run db:migrate:remote` in `apps/api`.
- Alert on the `audit.dlq_message`, `audit.undeliverable` and `audit.archive_repair` error log lines; the
  `audit-events-dlq` consumer replays dead-lettered events by itself. Delivery, retries, DLQ replay and the
  nightly archive are described in [docs/audit-operations.md](docs/audit-operations.md).

## SOC 2 control mapping (what exists today)

| Area | Control in code |
|---|---|
| Access provisioning (CC6.2) | WorkOS SSO/AuthKit, invites, SCIM-driven membership; SCIM members can't be edited by hand; Admin Portal links for SSO/SCIM setup |
| Deprovisioning (CC6.2/6.3) | Single `deprovisionMember` path from webhooks + dashboard: membership off, tokens revoked, user grants revoked, teams removed, per-user connected accounts deleted |
| Access reviews (CC6.2/6.3) | Review campaigns snapshot every membership and grant, and list live machine tokens with creator and allow-list; reviewers can't review their own access; revokes apply immediately; decisions are immutable; CSV evidence |
| Least privilege (CC6.3) | Org permissions per role, additive resource grants with expiry, tool allow-lists, API method/path allow-lists, read-only databases, project scoping |
| Separation of duties | Nobody approves their own request or reviews their own access; only owners grant owner |
| Encryption (CC6.1/6.7) | AES-256-GCM per-version DEKs wrapped by a KEK in Workers secrets, KEK rotation with DEK re-wrap; tokens stored as SHA-256; secret values leave only for secrets marked deliverable, one audit event per delivery |
| Logging & monitoring (CC7.2) | Hash-chained, append-only audit log (DB triggers), chain verify, NDJSON export, nightly R2 archive, retention purge only behind verified archives; OTEL traces linked across queue and Durable Object |
| Change management (CC8.1) | Guard prompts are drafted by an LLM and stay in draft until a human reviews and activates them; the call filter verify derives (which calls a rule is checked on) applies only once an admin accepts it |
| Privacy (P4.1, data minimisation) | The call-time classifier gets the caller's email and the connected account's identity only when a rule judging that call names people or that account (`CompiledGuard.references`); no member names or emails reach the guard compiler; see docs/connections.md |

## Known gaps

- WorkOS flows, webhooks, AuthKit OAuth claims, MySQL and the Clef request shape have not been run against
  the live services yet.
- Database tools connect over TCP per call (ClickHouse: one HTTPS request via `fetch`); Hyperdrive pooling
  needs a static binding per database.
- ClickHouse: the login must not have a `readonly` settings profile (ClickHouse then refuses the per-query
  `readonly=1`, `max_execution_time` and `max_result_rows` the gateway sends); restrict it with GRANTs instead.
  A read-only statement can lower but not raise the `limit` setting; the row cap still holds through
  `max_result_rows` and the driver's trim. `readonly=1` does not refuse read-only table functions such as
  `url()`, `s3()`, `remote()` or `file()`; the gateway refuses them on read-only grants, and the login should
  also lack the `URL`, `S3`, `REMOTE`, `FILE` and other source privileges. Smoke-tested against ClickHouse 26.11 locally, not ClickHouse Cloud.
- The API tool doesn't block private/loopback base URLs (only admins set them).
- Machine tokens are listed in access reviews but not yet attested item by item (keep/revoke decisions); a
  reviewer revokes them through `DELETE /api/machine-tokens/:id`. Machine-token audit actors are recorded as
  `system:machine_token:<id>` until the dashboard renders a dedicated actor type.
- No backfill tool for audit days archived before the purge existed; no JIT user creation on OAuth.

## Deploying Smartplane's own production

The committed `wrangler*.jsonc` files are neutral: no routes, resource ids or real names, so `wrangler deploy`
in a fresh account creates its own resources. Smartplane's production values live in an overlay that is never
committed: the `SMARTPLANE_PRODUCTION_OVERLAY` secret of the `production` environment (used by the Deploy
workflow) or a local `deploy/production.json` (shape: `deploy/production.example.json`).

```sh
bun run --filter @pc/deploy production-config     # writes wrangler.production.json beside each config
cd apps/integrations && bunx wrangler deploy -c wrangler.production.json && bunx wrangler deploy -c wrangler.business.production.json
cd ../api && bunx wrangler d1 migrations apply DB --remote -c wrangler.production.json && bunx wrangler deploy -c wrangler.production.json
cd ../web && bun run build && bunx wrangler deploy -c wrangler.production.json
```

Never deploy production with the committed configs: the generator refuses an overlay that leaves any D1, KV,
R2 or service binding without its production value.

## Licence

Smartplane is source-available under the [Functional Source License 1.1, Apache 2.0 Future License](LICENSE.md)
(FSL-1.1-ALv2), © 2026 Hypenspace d.o.o. You may use, modify and redistribute it for any purpose except
offering a product or service that competes with Smartplane. Each version becomes available under Apache 2.0
two years after its release. The name and logo are not licensed; see [TRADEMARKS.md](TRADEMARKS.md).
Bundled third-party code keeps its own licence; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
