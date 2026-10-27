# Smartplane

Agent access control plane. Orgs define the tools, skills, MCP servers, databases, APIs, secrets and
variables their agents may use. Users connect one MCP endpoint (ours) instead of many, and see only
what their role, team and project allow. Guard rules ("nobody deletes reports from the Q3 folder")
are compiled into Cloudflare Clef classifier prompts and checked before each action. Every event is
written to a tamper-evident audit log. Built for SOC 2 from the start.

## Layout

```
apps/api       Cloudflare Worker: Effect HttpApi + MCP gateway + queue consumer + cron + Durable Objects
apps/web       Dashboard SPA: Vite + React + TanStack Router + Tailwind v4 + shadcn/ui, served by Workers static assets
packages/domain  The contract: Effect Schemas, branded ids, tagged errors, HttpApi definition. No runtime deps besides effect.
```

Visual design, brand and copy rules (fonts, colours, logo, motion, voice) are in `DESIGN.md`. Read it before
touching `apps/web` UI. The marketing site and blog live in get-smartplane/landing.

## Stack rules

- **Bun** for installs and scripts. **Cloudflare** for everything that runs: Workers, D1, KV, R2, Queues,
  Durable Objects, Workers AI (Clef), static assets.
- **Effect 4** (`effect@4.0.5`, a single package: `effect`, `effect/Schema`, `effect/http-api/*`,
  `effect/http/*`, `effect/sql/*`, `effect/observability/*`). Effect 3 / `@effect/platform` APIs are wrong
  here; when unsure, read the `.d.ts` files in `node_modules/effect/dist`.
- **OpenTelemetry** via `effect/observability/Otlp` (OTLP/HTTP). Locally, run Maple
  (`maple start`, OTLP on `http://localhost:4318`) and point `OTEL_EXPORTER_OTLP_ENDPOINT` at it.
- **WorkOS** (AuthKit, Organizations, SSO, Directory Sync/SCIM) is the identity source of truth.

## Code rules

- **Schemas everywhere.** Every value crossing a boundary (HTTP, D1 rows, KV, queue messages, webhooks,
  Workers AI responses, env/config) is decoded with an Effect Schema. No `as` casts on external data,
  no `any`, no non-null `!` on external data.
- **Typed errors.** Failures are `Schema.TaggedError` classes (with `httpApiStatus`) in `packages/domain`, never thrown strings.
- **Services + Layers.** Each capability is a `class X extends Context.Service<X, Shape>()("X") {}` with a `layer`.
  Handlers stay thin: decode → call service → encode.
- Effect 4 examples ship in `node_modules/effect/ai-docs/src` (HTTP API: `51_http-server`). Read them before guessing.
- **Small files.** One concept per file; aim for under ~120 lines and treat 200 as a hard limit. Folders by feature.
- **Spans.** Service methods use `Effect.fn("Service.method")` so every call is a span. Never put secret
  values in span attributes or audit data.
- **Names over comments.** Comment only on *why* (security, compliance, non-obvious choices).
- `bun run typecheck` must pass with zero errors before you report done.

## Compliance invariants (do not break)

- Audit log is append-only and hash-chained per org (one `AuditLog` Durable Object per org serialises writes).
- Secrets are envelope-encrypted (AES-GCM DEK wrapped by a KEK from Workers secrets); plaintext is never
  stored or logged. By default a secret never leaves Smartplane and is usable only through gateway tools.
  The one exception: a secret an admin explicitly marks `deliverable` may be returned by
  `POST /api/secrets/deliver` (and only there) to a member with a live `use` grant or to a machine token
  listing it; every delivery is audited. Gateway tools and MCP never return secret values to agents.
- Machine tokens (`pcm_`) can only call `POST /api/secrets/deliver`, enforced in the authenticators. They
  belong to the org (offboarding their creator does not revoke them), so access reviews must list them.
- Offboarding is one code path (`deprovisionMember`): membership off, tokens revoked, direct grants revoked,
  team memberships removed. SCIM/WorkOS webhooks call it.
- Access tokens are stored as SHA-256 hashes only, expire (max 90 days), and die with the membership.
- Guards fail closed: if the classifier is down and an enforcing guard applies, deny.
- Nobody approves their own approval request.
