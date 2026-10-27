# Secret delivery: local commands and deployed services

Teams keep their real secrets only in Smartplane. By default a secret never leaves it: agents use it through
gateway tools (an MCP server's token, an API key, a database connection string) and never see the value.

An admin can mark a secret **deliverable**. Then, and only then, its value can be fetched by:

1. **Local commands**: `smartplane run -- <cmd>` injects the values into a child process's environment.
2. **Deployed services** (Railway, Fly, Render, a VM): the service fetches its values once at boot with a
   scoped **machine token**.

There is no egress proxy yet. Delivery is a field on the secret (`delivery`, a union of literals) decided in
one function (`deliverability`), so a per-secret `proxy_only` mode can be added later without touching callers.

Gateway tools and MCP still never return secret values to agents, deliverable or not.

## The two modes

| `delivery` | Who can get the value | Default |
|---|---|---|
| `gateway_only` | nobody; usable only through gateway tools | yes, for every secret, including all stored before delivery existed |
| `deliverable` | members with a live `use` grant (via `smartplane run`), and machine tokens that list it | no; an admin opts in per secret |

Variables are not secret and are always deliverable, under the same grant rule.

Change a secret's mode or env name with `PATCH /api/resources/:id/delivery`
`{ "delivery": "deliverable" | "gateway_only", "envName": "STRIPE_KEY" | null }`. It needs `resources:manage`
or an `admin` grant on the secret, and is audited as `secret.delivery_changed` with the before and after
mode and env name.

### Env names

A secret or variable is delivered under its `envName` (`^[A-Z_][A-Z0-9_]{0,127}$`), or, when none is set, its
name upper-snake-cased (`stripe-key` becomes `STRIPE_KEY`). Names are unique per org and project among
deliverable secrets and variables; a clash is a 409. A project's own secret may reuse an org-wide name: for
that project it overrides the org-wide value.

## Grant levels

Receiving a value needs a live grant at level `use` or higher on that secret or variable (grants are
`read ⊂ use ⊂ write ⊂ admin`; role, team, user and project scope and expiry resolve exactly as in the gateway).

| Level | What the holder can do |
|---|---|
| read | See it exists |
| use | Receive the value via run/boot, if it is deliverable |
| write | Rotate the value |
| admin | Change delivery, envName and grants |

`resources:manage` can do all of these. A member with a live `use` grant on a **deliverable** secret sees it in
the resource list (name, env name, kind, delivery, last rotated; never the value). `gateway_only` secrets stay
hidden from everyone without `resources:manage`. There is no "reveal value" endpoint for the dashboard: the
delivery endpoint is the only plaintext path.

Machine tokens are not affected by grants: their allow-list is their grant.

## `POST /api/secrets/deliver`

```http
POST /api/secrets/deliver
Authorization: Bearer pcm_... | pc_... | <AuthKit access token>

{ "purpose": "run" | "boot", "names": ["STRIPE_KEY"], "projectId": "prj_..." }
```

```json
{
  "env": [{ "name": "STRIPE_KEY", "value": "sk_live_...", "kind": "secret", "version": "3", "resourceId": "res_..." }],
  "denied": [{ "name": "GITHUB_TOKEN", "reason": "not_deliverable" }],
  "expiresAt": "2027-01-13T12:00:00.000Z"
}
```

- Without `names`, the caller gets everything it may receive in scope, and `denied` is empty: a request for
  everything never reveals what else exists. With `names`, each requested name not delivered is in `denied`:
  `not_deliverable` (granted but gateway-only), `no_grant` (the caller may know it exists but holds no `use`
  grant), `unknown` (no such name, or nothing the caller may know about), `policy` (a guard refused it).
- `version` is a secret's version number, or a variable's last change time.
- `expiresAt` is the machine token's expiry; `null` for members.
- Scope: org-wide resources plus `projectId`'s. A project-scoped token may not ask for another project (403).
  A machine token's scope is its allow-list.
- Responses carry `Cache-Control: no-store` and `Pragma: no-cache`.
- Errors: 401 (missing, invalid, expired or offboarded credentials), 403 (a service-account token, or another
  project), 429 with `Retry-After` (60 requests a minute per member token, 30 per machine token; one
  Durable Object counter per token), 400 (invalid body or env names).
- Each delivered value is one `secret.delivered` audit event with the actor (user, or the machine token as
  `system:machine_token:<id>` with `machineTokenId` and `machineName` in its data), purpose, project, env name,
  version, IP and user agent. Values never appear in audit data, spans, logs or error messages.
- `GET /api/audit/deliveries` (`audit:read`) summarises those events per resource in one call: `count`,
  `lastDeliveredAt` and `lastActor`, over the events still in the log (within retention). The dashboard's
  Secrets page uses it for "Delivered N times · last by X".

### Who receives what

- A member: deliverable secrets and variables they hold a live `use`+ grant on. An offboarded member's tokens
  and sessions are rejected (401) before anything is read. Service-account tokens (`pc_` for agents) get 403.
- A machine token: the intersection of its allow-list and what is currently deliverable. Entries that later
  become `gateway_only` or are deleted are excluded.

### Guards

Delivery is checked against active guards scoped to the secret, or org-wide. The classifier sees the action
`secret.deliver`, the arguments `{ name, purpose, tokenKind, machineName? }` and the actor (a member's email,
role and teams; a machine token's name, project and creator), so rules like "never deliver STRIPE_LIVE_KEY
outside the deploy team" work.

- `enforce`: that one secret is denied (`policy`), audited as `policy.denied`.
- `monitor`: delivered, audited as `policy.flagged`.
- `require_approval`: approval is out of scope for delivery (nobody is there to approve a process at boot),
  so it **denies**, like `enforce`.
- **Fail closed**: if the classifier is unreachable and an enforcing (or approval) guard applies, the secret
  is denied.

## Machine tokens

`/api/machine-tokens`: `GET` list, `POST` create (returns the plaintext once), `POST /:id/renew`, `DELETE /:id`.

- Prefix `pcm_`; only a SHA-256 hash is stored.
- Fields: `name` (the service), optional `projectId`, `allow` (secret and variable ids, each deliverable when
  added), expiry (default and maximum 90 days; renewing sets it up to 90 days from now and is audited
  `machine_token.renewed`), `createdBy`, `lastUsedAt`, `lastUsedIp`.
- Creating and renewing need `tokens:manage` and `resources:manage`; listing and revoking need `tokens:manage`
  or `reviews:manage`. All audited (`machine_token.created`, `.renewed`, `.revoked`).
- A machine token can only call `POST /api/secrets/deliver`. Every other API, and `/mcp`, rejects it with 401;
  this is enforced in the authenticators, not per handler.
- Machine tokens belong to the org. Offboarding the creator does **not** revoke them, so every access review
  lists the live ones with their creator and allow-list, and a reviewer (`reviews:manage`) can revoke them.

## Threat model

Delivery protects against **accidental leaks**: secrets pasted into agent transcripts, committed `.env`
files, values sitting in CI logs or in the Railway/Fly dashboard's variables page, and long-lived copies on
laptops. Values live only in Smartplane; every fetch is authenticated, scoped, rate limited, guarded and
audited, and access dies with the grant, the membership or the token.

It does **not** stop a process on the same machine from reading a delivered secret. Once a value is in a
process's environment, that process, its children, and anything able to read its memory or
`/proc/<pid>/environ` as the same user can read it. A compromised dependency in a service sees its secrets.

Recommended practice:

- Use narrow keys: restricted Stripe keys, read-only database users, per-service API keys.
- Keep the most dangerous secrets (production root credentials, signing keys, payment live keys with broad
  scope) `gateway_only`, so they are only ever used through gateway tools that guards check per call.
- One machine token per service, with the smallest allow-list, and a project scope.
- Add guards for sensitive names ("never deliver STRIPE_LIVE_KEY outside the deploy team").

## Example: a Railway service

1. In Smartplane, mark the service's secrets deliverable and create a machine token for it:

   ```bash
   curl -X POST https://app.smartplane.dev/api/machine-tokens \
     -H "Authorization: Bearer $SMARTPLANE_ADMIN_TOKEN" -H "content-type: application/json" \
     -d '{"name":"billing-api (Railway)","allow":["res_stripekey","res_databaseurl"],"projectId":"prj_billing"}'
   ```

2. In Railway, set one variable, `SMARTPLANE_TOKEN=pcm_...`, and remove the real secrets from Railway.
3. Set the start command to `smartplane run -- node server.js`. At boot the CLI calls
   `POST /api/secrets/deliver` with `purpose: "boot"` and starts `node server.js` with the values in its
   environment. Or fetch them in code with the `@smartplane/secrets` SDK at startup.
   Platforms without a start command (Vercel Functions, Cloudflare Workers) use the SDK instead: `loadSecrets()`
   at module scope on Vercel, and `createSecretsCache()` read inside the handler on Workers, where secrets arrive
   on `env`, not `process.env` (see the [SDK README](../packages/secrets-sdk/README.md)). The dashboard's
   machine-token dialog shows the exact steps per platform, plus a prompt that lets a coding agent do the setup
   with the built-in `smartplane` skill (`references/deploy.md`).
4. Renew the token before it expires (`POST /api/machine-tokens/:id/renew`); revoke it when the service is retired.

Locally, `smartplane run -- npm run dev` does the same with your own login, under your own grants.
`smartplane init` can move a repository's `.env` values into Smartplane for you: it creates the secrets and
variables, marks the secrets deliverable after one confirmation, and leaves the `.env` file for you to delete
(see [cli.md](cli.md#set-up-a-machine-and-a-repository-smartplane-init)).
