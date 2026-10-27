# Connections: shared and per-user accounts

Organisations often share one account (one Gmail, one Figma, one ClickHouse login). An admin connects it
once, everyone with a grant uses it, and each person's grants and the guard rules still decide every call.
A resource can instead be set up so each member connects their own account.

This applies to the credentialed resources: `mcp_server`, `api` and `integration`.

## Account mode

Each of those configs takes an optional `accountMode`:

| Mode | Who connects | Whose credential a call uses | Who may connect / disconnect |
|---|---|---|---|
| `shared` (default, and every resource stored before modes existed) | an admin, once | the shared account's | `resources:manage` only |
| `per_user` | each member with a grant on the resource | the caller's own, never anyone else's | each member, for themselves |

What "connect" means follows from the config (`ConnectMethod`):

| Resource | `shared` | `per_user` |
|---|---|---|
| `mcp_server`, `auth: { type: "secret", secretId, header? }` | the secret resource (`secret_reference`) | each member pastes their own token (`secret`); no `secretId` |
| `mcp_server`, `auth: { type: "oauth", clientId?, clientSecretId?, scopes? }` | an admin signs in (`oauth`) | each member signs in (`oauth`) |
| `api` | `authSecretId` (`secret_reference`) | each member pastes their own key (`secret`); no `authSecretId` |
| `integration`, `oauth2` | the existing org-level flow ([integrations.md](integrations.md#oauth2)) | each member signs in through the org's OAuth app |
| `integration`, `secret_text` / `basic` / `custom` | the connection's `secretId` | each member pastes their own value (JSON for `basic` / `custom`); no `secretId` |

The domain schemas enforce the last column: a shared secret credential needs its secret, and a per-user
config may not name one. `PUT /api/connections/resources/:id/mode` switches modes; it deletes the old mode's
connections (audited `connection.disconnected`, reason `mode_changed`) and refuses to go shared when that
would leave a secret-based resource without its secret. A shared OAuth2 integration going per-user is
disconnected too: its managed token secret is deleted (audited `resource.deleted`) and its status cleared, in
the same D1 batch that saves the new mode, so switching back needs a new sign-in.

### MCP server auth is a union

`McpServerConfig.auth` is `none | secret { secretId?, header? } | oauth { clientId?, clientSecretId?, scopes?, issuer?, tokenEndpoint? }`.
Rows (and API or CLI input) with the old `authSecretId` still decode, as `auth: { type: "secret", secretId }`;
writing a resource back stores the new shape. No data migration is needed.

## OAuth for upstream MCP servers

Implements the MCP authorization spec (2025-06-18 and later). The discovery and registration calls, and the
authorize URL with PKCE, go through `@modelcontextprotocol/client` (`discoverOAuthServerInfo`,
`registerClient`, `startAuthorization`); every document they return is decoded with Smartplane's schemas.

1. **Discovery** (`connections/oauth/discovery.ts`): RFC 9728 protected-resource metadata names the
   authorization server; RFC 8414 / OIDC metadata gives its endpoints. Metadata naming another resource is
   refused (RFC 9728 §3.3), as is a server whose metadata lists PKCE methods without `S256`. The MCP server
   chooses its authorization server, so that server's metadata is fetched only after the skills fetcher's SSRF
   screen passes (HTTPS, default port, public host), its `issuer` must equal the authorization server URL
   (RFC 8414 §3.3), and the issuer, authorization, token and registration endpoints must pass the same screen
   (plain `http://localhost` only when `ENVIRONMENT` is `development`). The userinfo endpoint is used only on
   the issuer's own host. `TokenEndpoint` refuses non-HTTPS URLs and does not follow redirects.
2. **Client**: the admin's `clientId` (plus `clientSecretId` for a confidential client; a public one sends only
   its id) or, without one, dynamic client registration (RFC 7591) as `client_secret_basic`, `client_secret_post`
   or a public client, in that order of preference by what the server supports. A registered client's secret
   lives only inside the encrypted credential (and, sealed, in the pending sign-in). An admin-supplied client is
   pinned to its authorization server: `auth.issuer` and `auth.tokenEndpoint` are set by the admin or on the
   first successful sign-in, kept through edits that keep the client, and a later discovery naming another
   issuer or token endpoint fails with `AuthorizationServerChanged` (audited `connection.refreshed_failed`,
   reason `authorization_server_changed`) before the client is used.
3. **Authorize**: code flow with PKCE S256 and the `resource` indicator (RFC 8707); scopes are the config's or
   the server's advertised ones. The single-use state (D1 `oauth_states`, taken with `DELETE … RETURNING`, 10
   minutes, `connection-state:v1:`) binds the flow to
   the org, resource, the starting user's dashboard session and the resource's auth settings at start.
4. **Callback**: `GET /api/connections/oauth/callback` exchanges the code (verifier and `resource` included),
   reads the account's identity from the `id_token` claims or the userinfo endpoint, stores the token set and
   audits `connection.connected`. It redirects to `<APP_URL>/resources/<id>?connection=connected` (shared) or
   `<APP_URL>/connections?resource=<id>&connection=connected` (per-user), or `connection=error&reason=<code>`
   (`ConnectionCallbackFailure`: `expired_state | denied | session_mismatch | resource_changed | exchange_failed`).
   Register this URI on admin-supplied clients (`GET /api/connections/oauth/settings`).
5. **Refresh**: a token expiring within a minute is refreshed before use; a 401 from the server refreshes and
   retries once. Writes compare-and-swap on the connection's version, so concurrent refreshes converge on one
   token set. A refused refresh marks the connection `needs_reauth` and audits `connection.refreshed_failed`.

Checked against the live discovery of `https://mcp.linear.app/mcp`, `https://mcp.notion.com/mcp` and
`https://mcp.figma.com/mcp` (all: protected-resource metadata, S256, a registration endpoint; Figma's
authorization server is `https://api.figma.com`). No real sign-in was completed.

A per-user server whose caller has not connected offers a single `<slug>__connect_account` tool (its tools
cannot be listed without an account); calling it returns the "connect your account" error below.

## One-click catalog of official MCP servers

`packages/domain/src/mcp-catalog/` holds a curated, schema-decoded list of official remote MCP servers (slug,
name, vendor, one-sentence description, a few "what it can do" phrases, category, popularity, logo, URL,
transport, auth `oauth-dcr | oauth-client | token`, docs URL, the vendor page the URL came from, notes, the
bundled integration for the same product, and the last verification). Only servers whose live discovery shows
dynamic client registration and S256 PKCE are `oauth-dcr`; the domain refuses an `oauth-dcr` entry whose
verification says otherwise. GitHub is the one `token` entry (its authorization server publishes no usable
RFC 8414 metadata and needs a pre-registered OAuth app).

`bun apps/api/scripts/verify-mcp-catalog.ts [--json out.json]` re-checks every entry and the rejected
candidates (`apps/api/scripts/mcp-catalog-candidates.ts`) with the production `McpOAuthDiscovery` (SSRF screen,
RFC 9728, RFC 8414, issuer and endpoint checks), plus an unauthenticated `initialize` for the
`WWW-Authenticate` challenge. It registers nothing, flags drift from the stored verification, and exits 1 when an
`oauth-dcr` entry stops passing.

| Endpoint | Who | What |
|---|---|---|
| `GET /api/mcp-catalog` | `resources:read` | every entry, with the org's resources at its URL (`added`: id, name, mode, `connected` / `needs_reauth` / `not_connected` / `per_user`, who connected it); only resources the caller can see count |
| `POST /api/mcp-catalog/:slug/connect` | `resources:manage` | body `{ accountMode, name?, returnTo?: "setup" \| "integrations", token? }`; creates the `mcp_server` resource through `Resources.create` (audited `resource.created`) and, for a shared `oauth-dcr` server, starts `ConnectionOAuth` (discovery, registration, PKCE) and returns `{ resource, authorizeUrl, expiresAt }`. Per-user: the resource only (`authorizeUrl: null`). Shared `token`: `token` becomes a `secret` resource the server references. A sign-in that cannot start removes the new resource again. Without `name`, the entry's name is numbered when taken. |
| `GET /api/resources/:id/tools` | `resources:manage`, or a grant on the server | the cached upstream tool list (`Upstream.listTools`), each tool with `access` from its MCP annotations (`readOnlyHint` → `read`; `destructiveHint`, or not read-only without more → `destructive`; `destructiveHint: false` → `write`; none → `unknown`). Grant holders see only the tools their grants allow. `status`: `available` / `not_connected` / `unavailable`. Display only: hints never decide policy. |

`returnTo` is kept in the pending sign-in; the callback then lands on
`<APP_URL>/setup?step=tool&resource=<id>&connection=…` or `<APP_URL>/integrations?resource=<id>&connection=…`.

Dashboard: Integrations shows "Popular" catalog cards (search, categories, state badges, Connect / Sign in /
Open) above the bundled integrations; a piece that has a catalog server is listed only under that server's
"Other ways to connect". Onboarding step 1 shows the top six catalog servers and "More…". MCP server pages
list their tools, and the grant dialog's tool allow-list becomes a checklist of the live tools with
destructive ones marked.

## Storage and secrecy

- `connections` table (migration `0005_connections.sql`): one row per (resource, owner); `user_id` NULL is the
  shared account. Metadata (mode, method, status, `accountIdentity`, `connectedBy`, times) is readable; the
  credential is an envelope (`ciphertext`, `iv`, `wrapped_dek`, `kek_id`) in the same AES-256-GCM / AES-KW
  format and under the same KEKs as secret versions, and KEK rotation (`secrets.rewrap`, nightly cron) re-wraps
  it too. A shared OAuth integration keeps its tokens in its managed secret resource as before; its row
  only describes the account (no envelope).
- Per-user credentials are not `secret` resources, so nobody can reference them from another resource, and
  the only code path that opens one is `ConnectionResolver.credential` for the caller's own (resource, user)
  row. The API returns metadata only. Each opening is audited as `secret.accessed` on the connection.
- Deleting a resource deletes its connections in the same D1 batch. `deprovisionMember` deletes the member's
  per-user connections (and their credentials) in its batch and audits `connection.disconnected`
  (reason `deprovisioned`) for each.
- Tokens, refresh tokens, client secrets and PKCE verifiers never appear in audit data, span attributes or
  logs (tested).

## Permissions and guards over a shared account

The pipeline order is unchanged and the credential comes last:

```
grant check (resource, tool/action, argument constraints, expiry, project scope)   ← per person
  → connection context (metadata only: mode, account identity, who connected it)
  → guards (one Clef call; enforce / monitor / require_approval; fail closed)
  → credential decrypted (shared, or the caller's own) → upstream call → audit
```

A member without a grant never reaches the shared credential (the tool does not exist for them), and a
granted call refused by an argument constraint or a guard is refused before anything is decrypted. (Listing
an MCP server's tools does use the account, for callers with a grant; the list is cached for five minutes.)

Guards see the real caller and the account, but only as much of either as the guards judging that call
need. With every identity field present (a rule that names a person and the billing@ account), the Clef
state is:

```json
{
  "actor": { "type": "User", "email": "eve@acme.com", "role": "member", "teams": ["team_…"], "teamNames": ["Sales"], "project": null },
  "resource": { "kind": "mcp_server", "name": "Gmail", "description": "…", "accountMode": "shared" },
  "connection": { "mode": "shared", "accountIdentity": { "email": "billing@acme.com", "subject": "…" }, "connectedBy": { "userId": "usr_…", "email": "ada@acme.com" } },
  "tool": "send_email",
  "arguments": { "to": "…" }
}
```

so rules such as "nobody except finance sends email from the shared billing@ Gmail" or "monitor all writes
through the shared Figma account" can be written; the guard compiler is told about these fields. Guard tests
(`POST /api/guards/:id/test`) accept an optional `connection` in the sample.

### Personal data minimisation

Emails and account identities are personal data, and most rules do not need them ("contractors can't push"
needs the team, not the person). When a rule is verified, `CompiledGuard.references` records, locally and
deterministically (no model sees the member directory), what it names:

- `people`: the rule mentions a member by email, full name or first name, its suggested approvers or its call
  filter name a person, or a name in it matched nobody (it may still be a person);
- `accounts`: account addresses in its wording, e.g. `billing@` or `ops@acme.com`.

At call time the state is built from the guards that judge that call (after scope and call filters):

| Field | Sent when |
|---|---|
| `actor.role`, `actor.teams`, `actor.teamNames`, `actor.project`, `actor.type` | always |
| `actor.email` (a service account's `actor.name`) | a judging guard names people |
| `connection.mode` | always (shared or the caller's own account) |
| `connection.accountIdentity` | a judging guard names that account: the same address, or the same local part for `billing@` |
| `connection.connectedBy` | a judging guard names people |

One caller per call, so no stand-in label ("member A") is needed for the state to stay coherent. Rules verified
before `references` existed still get every field until they are verified again; that keeps their behaviour
exactly as reviewed. A false "names people" only sends the email as before; a miss would hide who is acting
from a rule about them, which is why matching names is generous. Tested by scanning every classifier input
(`apps/api/src/mcp/pipeline-guards.test.ts`), as the verify PII test does for the compiler's inputs.

Calls through an account carry `connection: { mode, accountIdentity, connectedBy }` in `mcp.tool_called`,
`policy.denied`, `policy.flagged` and `policy.pending_approval`, beside the acting user as the event's actor.

## Errors the agent and the dashboard see

| Cause | MCP tool result | Audit |
|---|---|---|
| No grant / tool or argument not allowed | `Denied by your access grants: NoGrant` (etc.) | `policy.denied`, grant reasons |
| A guard | `Denied by a guard rule: GuardViolation` / approval needed | `policy.denied` / `policy.pending_approval` |
| No connected account | `Not connected: … Connect it at <url>, then retry.` with `structuredContent.error = { type: "AccountNotConnected", resourceId, connectUrl, shared }` | `policy.denied`, `NotConnected` |

The dashboard explains `NotConnected` beside the grant and guard reasons in the audit log and in toasts.

## API

| Endpoint | Who | What |
|---|---|---|
| `GET /api/connections/resources/:id` | `resources:read` | mode, method, the shared connection, the caller's own, `canManage` |
| `GET /api/connections/mine` | members | per-user resources the caller holds a grant on, with their own connection |
| `PUT /api/connections/resources/:id/mode` | `resources:manage` | switch `shared` / `per_user` |
| `POST /api/connections/resources/:id/oauth/start` | shared: `resources:manage`; per-user: a grant | `{ authorizeUrl, expiresAt }` |
| `POST /api/connections/resources/:id/secret` | per-user, a grant | connect the caller's own token or key |
| `POST /api/connections/resources/:id/disconnect` | shared: `resources:manage`; per-user: the caller | delete the connection |
| `GET /api/connections/oauth/settings` | `resources:read` | the redirect URI for admin-supplied OAuth clients |

## Dashboard

- Resource pages (MCP servers, APIs, integrations) have a **Connection** panel: the mode switch (admins), the
  connected account, who connected it and when, Connect / Reconnect / Disconnect.
- **My connections** (`/connections`, in the sidebar) lists the caller's per-user resources with Connect /
  Disconnect; the gateway's "connect your account" links land here.

## Code

| Path | What |
|---|---|
| `packages/domain/src/connections/` | `AccountMode`, `AccountIdentity`, `ConnectionContext`, `McpAuth`, `Connection`, `AccountNotConnected` |
| `packages/domain/src/api/connections.ts` | `ConnectionsApi` |
| `apps/api/src/connections/` | repo, vault, resolver, token refresh, mode switch, API service, KEK re-wrap |
| `apps/api/src/connections/oauth/` | discovery, registration, plan, pending state, start, callback, identity, route |
| `apps/api/src/mcp/upstream.ts`, `upstream-client.ts` | credential injection, 401 refresh-and-retry |
| `apps/web/src/features/connections/` | Connection panel, My connections |

## Gaps

- The callback needs the dashboard session that started the flow; a sign-in started from the CLI with a
  `pc_` token cannot be finished there.
- Dynamic registration runs on every Connect (one client per sign-in); registrations are not reused or
  deleted. Client ID Metadata Documents (SEP-991) are not used yet.
- Provider "me" calls for account identity are not made; only `id_token` claims and OIDC userinfo.
- A per-user MCP server's tool list is cached per user for five minutes after a connect or disconnect.
- Admins cannot remove another member's per-user connection except through offboarding.
