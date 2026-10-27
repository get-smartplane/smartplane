# Integrations

Smartplane runs curated [Activepieces](https://github.com/activepieces/activepieces) pieces (MIT-licensed
TypeScript integrations for GitHub, Slack, Google Workspace, ...) as governed MCP tools. Smartplane owns the
whole path: credentials (envelope-encrypted secrets, OAuth2 tokens it refreshes itself), authorization (grants,
tool and argument allow-lists, Clef guards), execution (its own Worker) and audit (the hash-chained log).

## Stage 1 and Stage 2

**Stage 1: an Activepieces MCP server upstream.** An Activepieces instance can already be added as an
`mcp_server` resource. Its tools are generic (one tool runs any piece's action, with the piece and action
named in the arguments), so a tool allow-list alone cannot say "Slack only". Grants now carry **argument
constraints** for exactly this (tool and argument names here are illustrative; use the names the upstream
server lists):

```json
{
  "tools": ["ap_run_action"],
  "arguments": { "ap_run_action": { "pieceName": ["slack"], "actionName": ["send_message_to_a_channel"] } }
}
```

**Stage 2 (this document): native integrations.** Pieces are bundled into Smartplane, their actions become
first-class gateway tools (`github__create_issue_ai`) with real input schemas, and no Activepieces deployment
is involved. Prefer Stage 2; Stage 1 remains for pieces outside the curated set.

## Architecture

```
                                   build time (bun run generate)
  @activepieces/piece-* ──▶ packages/integrations ──▶ src/generated/catalog.json        (pieces, actions, JSON Schemas, support, shard)
   (pre-bundled npm)          curation.ts            src/generated/pieces/<shard>.ts   (static lazy imports per runner Worker)

  run time
  MCP client ──/mcp──▶ apps/api (smartplane-api)
     tools/list          integration ToolProvider: catalog × grants × resource `actions` → <slug>__<action>
     tools/call          ToolPipeline: validate args (catalog schema) → grant + argument constraints
                           → Clef guards → IntegrationCredentials (secrets / OAuth2 refresh, audited)
                           → IntegrationRunner ──service binding RPC (schema-encoded)──┐
                             (catalog shard → INTEGRATIONS | INTEGRATIONS_BUSINESS)     │
                           → audit `mcp.tool_called`                                   │
                                                                                       ▼
                         apps/integrations, one Worker per shard (no public routes):
                           smartplane-runner (core) · smartplane-runner-business (business)
                           CatalogIndex (supported only) → validate again → PieceLoader (lazy import)
                           → minimal ActionContext (auth, propsValue, KV store, stubs) → action.run
                           → timeout 25 s → JSON-safe, scrubbed output (≤ 256 KB)
```

One trace spans both Workers (the RPC request carries `traceparent`), e.g. in Maple:
`POST /mcp → ToolPipeline.run → IntegrationCredentials.forRun → IntegrationRunner.run → integrations.run →
PieceRunner.run`.

| Code | What |
|---|---|
| `packages/domain/src/integrations/` | Contract: `IntegrationConfig`, connections, catalog schemas, `requiredGrantAction` |
| `packages/domain/src/api/integrations.ts` | `IntegrationsApi` group (catalog, OAuth) |
| `packages/integrations` | Curated list (with each piece's shard), generator, prop→JSON Schema converter, auth converter, AI-variant rule, input validator, RPC contract, shard → Worker/binding map (`shards.ts`) |
| `apps/integrations` | The runner Workers: one `WorkerEntrypoint` with a `run` RPC (`src/worker.ts`), one entry per shard (`src/shards/*.ts`, `wrangler.jsonc`, `wrangler.business.jsonc`) |
| `apps/api/src/integrations/` | Catalog service, config checks, credentials, shard-routed runner client (`runner.ts`, `shards.ts`), OAuth2 flow, templates and refresh |
| `apps/api/src/gateway-tools/integration/` | The gateway tool provider |

## Curated pieces

37 pieces, 1,739 actions: 1,575 runnable, 132 hidden as superseded by an agent variant, 32 unsupported. Pieces
are split over two runner Workers (shards, below): `core` 20 pieces / 1,124 runnable, `business` 17 / 451.

**Shard `core`** (`smartplane-runner`):

| Piece | id | Version | Connects with | Actions | Runnable |
|---|---|---|---|---|---|
| GitHub | `github` | 0.10.1 | oauth2, custom (GitHub App), secret_text | 93 | 84 |
| GitLab | `gitlab` | 0.4.2 | oauth2 | 114 | 114 |
| Linear | `linear` | 0.9.1 | secret_text | 58 | 46 |
| Jira Cloud | `jira-cloud` | 0.5.2 | custom | 77 | 75 |
| Notion | `notion` | 0.7.5 | oauth2, custom | 37 | 29 |
| Confluence | `confluence` | 0.3.2 | custom | 21 | 20 |
| Asana | `asana` | 0.7.2 | oauth2 | 126 | 126 |
| Trello | `trello` | 0.7.1 | basic | 75 | 70 |
| Todoist | `todoist` | 0.6.1 | oauth2 | 47 | 44 |
| Figma | `figma` | 0.6.3 | oauth2 | 4 | 4 |
| Google Sheets | `google-sheets` | 0.18.2 | oauth2, custom (service account) | 61 | 43 |
| Google Drive | `google-drive` | 0.12.2 | oauth2, custom (service account) | 53 | 46 |
| Google Calendar | `google-calendar` | 0.12.3 | oauth2, custom (service account) | 25 | 22 |
| Gmail | `gmail` | 0.18.1 | oauth2, custom (service account) | 37 | 35 |
| Slack | `slack` | 0.23.1 | oauth2, custom (bot token) | 73 | 58 |
| Discord | `discord` | 0.7.2 | secret_text | 61 | 52 |
| Resend | `resend` | 0.5.2 | secret_text | 58 | 58 |
| Zendesk | `zendesk` | 0.5.1 | custom, oauth2 | 117 | 109 |
| Stripe | `stripe` | 0.8.1 | secret_text | 98 | 87 |
| HTTP | `http` | 0.13.0 | none | 2 | 2 |

**Shard `business`** (`smartplane-runner-business`): Microsoft 365, ERP and finance, CRM.

| Piece | id | Version | Connects with | Actions | Runnable |
|---|---|---|---|---|---|
| Microsoft Outlook | `microsoft-outlook` | 0.7.3 | oauth2 | 57 | 54 |
| Microsoft Outlook Calendar | `microsoft-outlook-calendar` | 0.3.1 | oauth2 | 4 | 4 |
| Microsoft Excel 365 | `microsoft-excel-365` | 0.8.2 | oauth2 | 33 | 33 |
| Microsoft OneDrive | `microsoft-onedrive` | 0.6.1 | oauth2 | 41 | 38 |
| Microsoft SharePoint | `microsoft-sharepoint` | 0.4.2 | oauth2 | 16 | 15 |
| Microsoft Teams | `microsoft-teams` | 0.7.3 | oauth2 | 16 | 14 |
| Microsoft To Do | `microsoft-todo` | 0.5.1 | oauth2 | 42 | 32 |
| Microsoft 365 People | `microsoft-365-people` | 0.3.1 | oauth2 | 7 | 7 |
| Dynamics 365 Business Central | `microsoft-dynamics-365-business-central` | 0.3.0 | oauth2 | 6 | 6 |
| Dynamics 365 (Dataverse / CRM) | `microsoft-dynamics-crm` | 0.4.1 | oauth2 | 5 | 5 |
| NetSuite | `netsuite` | 0.2.1 | custom (token-based auth) | 5 | 5 |
| Odoo | `odoo` | 0.3.2 | custom (API key) | 49 | 44 |
| QuickBooks Online | `quickbooks` | 0.3.3 | oauth2 | 13 | 13 |
| Xero | `xero` | 0.8.1 | oauth2 | 58 | 52 |
| Zoho Books | `zoho-books` | 0.2.0 | oauth2 | 1 | 1 |
| Salesforce | `salesforce` | 0.9.4 | oauth2 (PKCE) | 104 | 89 |
| Zoho CRM | `zoho-crm` | 0.4.1 | oauth2 | 45 | 39 |

Unsupported in `business`: file inputs (attachments and uploads, 15) and approval actions that pause a flow
(Outlook, Teams ×2). Zoho Books offers only its generic `custom_api_call`. Business Central's actions are
unclassified by their piece, so even reads need a `write` grant (fail safe).

Left out: Airtable (its bundle constructs `new Request("")` at load, which Workers reject), HubSpot (5 MB),
and Pipedrive, ClickUp, SendGrid (kept the bundle small; easy to add).

### Adding a piece

```sh
cd packages/integrations
bun add @activepieces/piece-<id>
# add core("<id>") or business("<id>") to src/curation.ts
bun run generate        # rewrites src/generated/catalog.json and src/generated/pieces/<shard>.ts, prints support counts
cd ../../apps/integrations
bunx wrangler deploy --dry-run --outdir /tmp/core-dry                                   # check each bundle
bunx wrangler deploy -c wrangler.business.jsonc --dry-run --outdir /tmp/business-dry
```

Commit the generated files. The generator fails if a piece does not load or export a piece; it marks
actions whose input schema the runtime cannot compile as unsupported. Re-run `generate` after bumping a
piece version.

## The catalog

Per piece: id, name, description, logo, categories, version, auth methods (non-secret metadata only:
OAuth2 URLs, scopes, PKCE, custom form fields) and every action with `inputSchema` (JSON Schema 2020-12),
`classification`, `audience`, `idempotent`, `requiredAction` (`use` | `write`), `dynamicInputs` and
`support`.

**Props → JSON Schema** (`packages/integrations/src/props/convert.ts`):

| Activepieces prop | JSON Schema |
|---|---|
| `SHORT_TEXT`, `LONG_TEXT`, `RICH_TEXT`, `COLOR` | `string` |
| `NUMBER` / `CHECKBOX` | `number` / `boolean` |
| `DATE_TIME` | `string`, `format: date-time` |
| `STATIC_DROPDOWN` | `enum` of the option values (primitive values); otherwise the choices are listed in `description` |
| `STATIC_MULTI_SELECT_DROPDOWN` | `array` of that enum |
| `DROPDOWN` (live options) | untyped, with a description: pass the option's value, usually an id. Listed in `dynamicInputs` |
| `MULTI_SELECT_DROPDOWN` | `array`, same note |
| `DYNAMIC` | `object` whose fields depend on the named refreshers |
| `ARRAY` | `array` of strings, or of objects when the prop declares item `properties` |
| `OBJECT` / `JSON` | `object` / any JSON |
| `MARKDOWN` | omitted (display text) |
| `FILE`, unknown types | required: action unsupported; optional: omitted |

Titles, descriptions, defaults and `required` carry over; `additionalProperties: false`. Dropdowns are left
untyped because some pieces use object values (e.g. `{ owner, repo }`). Resolving live options needs a
connection and the piece's `options()` function; that is not exposed yet (the AI variants take plain ids).

**Preferring AI variants.** Pieces often ship an agent action (`audience: "ai"`, flat inputs, e.g.
`create_issue_ai`, "Create Issue (Agent)") next to the flow-builder one (`audience: "human"`,
`github_create_issue`, "Create Issue"). When a `human` action's display name matches an `ai` action's
(ignoring an "(Agent)"/"(AI)" suffix, case and punctuation), the classic action is `superseded` and not
offered. `both`-audience actions are never hidden (`src/actions/supersede.ts`, tested).

**Support.** `supported`, `superseded { by }`, or `unsupported { reason }`: a required file input, or a
`run` that uses context only an Activepieces deployment has (`server`, `flows`, `agent`, `connections`,
waitpoints/approvals). The detection reads each action's `run` source (a heuristic; helpers are not
followed), and the runtime context fails with `UnsupportedAction` if an action reaches for those anyway.

## Integration resources

```ts
{ kind: "integration", pieceId: "github", connection: IntegrationConnection, actions?: ["get_issue_ai", ...] }
```

Connections reference `secret` resources; credentials are never inline.

| `connection.type` | Secret contents |
|---|---|
| `none` | (no secret; e.g. `http`) |
| `secret_text` `{ secretId }` | the API key or token |
| `basic` `{ secretId }` | JSON `{ "username": ..., "password": ... }` |
| `custom` `{ secretId }` | JSON object of the piece's custom fields (`PieceAuth.fields`; required ones are checked before a run) |
| `oauth2` `{ clientId, clientSecretId, props? }` | the OAuth app's client secret; tokens are managed (below) |

The connection type must be one the piece offers. `actions` is an optional allow-list of supported actions.
Creating and editing go through `POST/PATCH /api/resources` (input form: `IntegrationConfigInput`); the stored
OAuth2 connection also has `status` (`not_connected` | `connected` | `needs_reauth`) and `tokenSecretId`,
which only Smartplane sets. Changing the OAuth app (client id or secret) resets the connection.

## Grants

- **`use`** covers actions classified `read` or `search`; **`write`** covers everything else, including
  `destructive` and unclassified actions (`requiredGrantAction`).
- `conditions.tools` lists action names (not prefixed), exactly like upstream tool names for MCP servers.
- `conditions.arguments` (also for MCP servers and single tools): per tool, the values each argument path
  may take. Exact matches of strings, numbers and booleans; for an array value every element must be
  allowed; a missing value never matches.
- Each grant is evaluated on its own: one grant must imply the action, list the tool and accept the
  arguments. A broad `write` grant without a tool list is unconstrained; a `write` grant listing other tools
  does not lift another grant's argument constraint. Refusals are `PolicyDenied` with `ArgumentNotAllowed`
  `{ resourceId, tool, path }`. A call to a name no offered tool has is audited as `policy.denied` with
  `UnknownTool { tool }` (there is no resource to check grants against).
- The dashboard's limits editor types values from the action's input schema (`7` for a number input is the
  number 7). For MCP servers and single tools it has no schema, so a bare number or `true`/`false` is sent
  as a number or boolean and a double-quoted value as text.

Tools are named `<resource-slug>__<action>` and carry MCP annotations from the classification:
`readOnlyHint` for read/search, `destructiveHint` for destructive, unclassified, or delete-like writes,
`idempotentHint` from the piece, `openWorldHint: true`. OAuth2 integrations offer tools only while
`connected`, and only while the runner Worker of the piece's shard is bound (`INTEGRATIONS` for `core`,
`INTEGRATIONS_BUSINESS` for `business`).

## OAuth2

Each integration uses the org's own OAuth app at the provider:

1. `GET /api/integrations/oauth/settings` gives the redirect URI to register on the app:
   `<API_URL>/api/integrations/oauth/callback` (under `/api/*`, which is already routed to the API Worker on
   the dashboard hostname).
2. Create a `secret` resource with the client secret, then the integration with
   `{ type: "oauth2", clientId, clientSecretId, props? }` (`props` fills templated endpoints, e.g. a Zendesk
   `subdomain`). Several integrations can share one OAuth app by referencing the same secret.
3. `POST /api/integrations/:id/oauth/start` (needs `resources:manage`) returns `{ authorizeUrl, expiresAt }`;
   send the browser there. The state (random, single use, 10 minutes, in KV) binds the flow to the org,
   integration, user and OAuth app; PKCE is used when the piece supports it (`S256` or `plain` as the piece
   declares). `access_type=offline` and `prompt=consent` are sent so providers issue refresh tokens (no
   `prompt` where the piece says to omit it, as the Microsoft pieces do).
4. The provider redirects to the callback, which requires the same dashboard session that started the flow,
   exchanges the code (client credentials in the body or a Basic header, as the piece declares), stores the
   token set as a new **managed secret resource** ("<name> OAuth token", envelope-encrypted), marks the
   connection `connected`, audits `integration.connected`, and redirects to
   `<APP_URL>/resources/<id>?integration=connected` (or `?integration=error&reason=<code>`, with the codes of
   `IntegrationCallbackFailure` in `packages/domain`: `expired_state | denied | session_mismatch |
   integration_changed | exchange_failed`; the dashboard decodes `reason` with the same schema and shows a
   generic message for anything else).

Before a run, a token expiring within a minute is refreshed with the refresh token; the new set is stored as
a new secret version (`secret.rotated`, actor `system:oauth-refresh`). Concurrent refreshes are tolerated: if
a refresh fails, the latest stored version is used when another call already refreshed it. A rejected
refresh (`invalid_grant`/401) sets `needs_reauth` and audits `integration.connection_failed`.
`POST /api/integrations/:id/oauth/disconnect` deletes the token secret and resets the connection, and deleting
the integration resource deletes its managed token secret too (audited `resource.deleted`, reason
`integration_deleted`). Neither revokes the grant at the provider; the org does that in the provider's app
settings.

Pieces receive only `{ access_token, token_type, scope, data, props }`, where `data` is the provider's token
response without its `refresh_token` (`IntegrationCredentials` strips it); refresh tokens and client secrets
never leave apps/api.

### Shared and per-user accounts

An integration has an `accountMode` (see [connections.md](connections.md)). `shared` (the default) is everything
above: one account an admin connects, recorded with who connected it, when, and the provider's account
identity (`id_token` claims) on the resource's Connection panel, in `connection.connected` and in the
`connection` field of every call's audit event. `per_user`: each member with a grant connects their own account
on the "My connections" page: an OAuth2 sign-in through the same org OAuth app (tokens kept in the member's
encrypted connection, never in a secret resource), or their own pasted credential for `secret_text`, `basic`
and `custom` (whose connection then names no `secretId`). A caller who has not connected gets a typed "connect
your account" MCP error. Providers that refresh tokens at a separate endpoint are listed in
`apps/api/src/integrations/oauth/refresh-url.ts` (Figma: `/v1/oauth/refresh`).

### Connection fields

An OAuth2 piece's `fields` (catalog `auth[].fields`) are the connection's `props`
(`apps/api/src/integrations/oauth/connection-props.ts`, `templates.ts`):

- A blank field takes the piece's `defaultValue` (Microsoft `cloud` = `login.microsoftonline.com`, `tenant`
  = `common`, Business Central `environment` = `Production`, Salesforce `environment` =
  `login.salesforce.com`). Pieces and endpoints see the resolved values.
- A `select` field takes only one of its `options` (Microsoft `cloud`, Zoho `location`, Outlook
  `accessMode`); a required field without a value or default is refused. Both are checked when the
  integration is saved (`InvalidInput`, field `config.connection.props`) and again when a flow starts.
- `{field}` placeholders are filled in the authorize and token URLs (values URL-encoded, so a value cannot
  change the host's path, port or userinfo) and in scopes (raw; a value may hold several space-separated
  scopes: Outlook's `{accessMode}`, Dynamics' `{hostUrl}/.default`).
- `curation.ts` can add scopes a piece forgets: Business Central gets `offline_access`, without which
  Microsoft issues no refresh token and the connection would lapse after an hour.

### Provider setup

Register `<API_URL>/api/integrations/oauth/callback` as the redirect URI in every OAuth app below.

| Provider | Register | Connection fields | Notes |
|---|---|---|---|
| Microsoft 365 (Outlook, Calendar, Excel, OneDrive, SharePoint, Teams, To Do, People) | Microsoft Entra ID → App registrations: platform **Web**, a client secret (Certificates & secrets); client id = Application (client) ID. Add the delegated Microsoft Graph permissions in the piece's catalog `scopes` and grant admin consent where Graph requires it (Teams' `ChannelMessage.Read.All`, `OnlineMeeting*`; SharePoint's `Sites.*.All`). | `cloud` (global or `login.microsoftonline.us` for US Government, whose Graph is `graph.microsoft.us`); Outlook `tenant`, Teams `tenantId`: `common` or the Directory (tenant) ID / `<name>.onmicrosoft.com`; Outlook `mailbox` (optional shared mailbox) | Only Outlook and Teams take a tenant; the others sign in at `/common`, so their app must be multi-tenant ("Accounts in any organizational directory"). Keep Outlook's default `accessMode`: the `.default` options carry no `offline_access`, so no refresh token. |
| Dynamics 365 Business Central | Same Entra app, plus the **Dynamics 365 Business Central** delegated permissions `user_impersonation` and `Financials.ReadWrite.All`. | `cloud`, `environment` (default `Production`) | Multi-tenant app (signs in at `/common`). Smartplane adds `offline_access`. Its actions are unclassified, so they need a `write` grant. |
| Dynamics 365 / Dataverse (CRM) | Entra app with the **Dynamics CRM** delegated permission `user_impersonation`. | `hostUrl` (`https://<org>.crm.dynamics.com`, required; the scope requested is `<hostUrl>/.default`), `tenantId`, `cloud`, optional `proxyUrl` | `proxyUrl`, when set, receives the access token. |
| QuickBooks Online | Intuit Developer → app → Keys & credentials (production redirect URIs must be https). Scope `com.intuit.quickbooks.accounting`. | `companyId` (Realm ID, required) | The piece calls the production API only (no sandbox companies). |
| Xero | developer.xero.com → Web app. | none | The scopes include `offline_access`. Each action takes the organisation as `tenant_id`. |
| Zoho Books, Zoho CRM | api-console.zoho.com → Server-based Application. | `location`: the org's data centre (`zoho.com`, `zoho.eu`, `zoho.in`, `zoho.com.au`, `zoho.jp`, `zohocloud.ca`) | API calls go to the token response's `api_domain`. Zoho Books has only `custom_api_call`. |
| Figma | figma.com/developers/apps → Create a new app (team or organization) → OAuth credentials → Add a redirect URL. Scopes (the piece's): `file_content:read`, `file_metadata:read`, `file_comments:read`, `file_comments:write`. A draft app works only for its creator and the plan's admins; publish it as a **private** app (no Figma review) for everyone in the team or organization. | none | Actions: `get_file`, `get_comments` (`use`), `post_comment`, `custom_api_call` (`write`). Client credentials go in a Basic header (Figma requires it). Access tokens last 90 days; Smartplane refreshes them at Figma's separate `/v1/oauth/refresh` endpoint (`integrations/oauth/refresh-url.ts`). A personal access token instead: see below. |
| Salesforce | Setup → App Manager → connected app (or External Client App): OAuth on, callback URL, scopes `api`, `refresh_token`, `full`; PKCE is used (S256). | `environment`: `login.salesforce.com` (production), `test.salesforce.com` (sandbox) or the My Domain host | API calls go to the token response's `instance_url` (kept across refreshes). |

**Figma with a personal access token.** The Figma piece connects with OAuth2 only. To share one Figma account's
personal access token (Figma → Settings → Security → Personal access tokens, with the scopes the agents need),
use an `api` resource instead: a `secret` holding the token, then
`{ kind: "api", baseUrl: "https://api.figma.com", authSecretId: <secret>, authHeader: "X-Figma-Token", allowedMethods: ["GET"], allowedPaths: ["/v1/files"] }`
(Figma reads PATs from `X-Figma-Token`, not `Authorization`). Add `POST` to `allowedMethods` to let holders of a
`write` grant post comments (`/v1/files/<key>/comments`). Per-person grants and guards apply to
`<slug>__request` as to any API.

Custom-field connections (the secret is a JSON object of these fields):

| Provider | Secret fields | Notes |
|---|---|---|
| NetSuite | `accountId`, `consumerKey`, `consumerSecret`, `tokenId`, `tokenSecret` (token-based authentication: an integration record and an access token for a role with REST Web Services) | Requests are signed with OAuth 1.0a HMAC-SHA256 in the runner. `accountId` is used verbatim as the REST host label: a sandbox is `1234567-sb1`. |
| Odoo | `base_url`, `database`, `username`, `api_key` (Preferences → Account Security), optional `port` | XML-RPC over `node:http(s)`. The piece ignores a port in `base_url`: set `port` for a non-default one. |

## The runner Worker

`apps/integrations` (`smartplane-runner` and `smartplane-runner-business`, see Shards) is a `WorkerEntrypoint` with one RPC method,
`run(RunRequest) → RunResponse`, both schema-encoded (`packages/integrations/src/rpc.ts`). `workers_dev`
and preview URLs are off; `fetch` answers only `/health`.

It builds a minimal Activepieces `ActionContext`:

- `auth`: the Activepieces connection value (`{ type: "SECRET_TEXT", secret_text }`, `BASIC_AUTH`,
  `CUSTOM_AUTH { props }`, `OAUTH2 { access_token, data, props }`), as pieces read it.
- `propsValue`: the validated input plus the piece's declared defaults.
- `store`: KV (`STORE`), keys `integration-store:<org>:<resource>:<scope>:<key>`, values ≤ 64 KB.
- `files.write`: answers with a note (`report.pdf (1234 bytes; Smartplane does not store files)`) so actions
  that attach files still return their data.
- `project.id`, `run.id`, `step.name`, `tags.add`, `output.update`, `run.stop/respond`: inert values.
- `server`, `flows.list`, `connections.get`, `agent.tools`, waitpoints, `generateResumeUrl`: throw
  `UnsupportedAction`.

Failures are typed: `UnknownAction`, `UnsupportedAction`, `InvalidInput`, `AuthFailed` (provider 401; a 403
is an `UpstreamError`, the credential works but lacks access), `UpstreamError { status }`, `Timeout` (25 s).
Error messages and output are scrubbed of every credential string in each spelling a request or response
can carry (raw, JSON-escaped, URL-encoded, base64, and `base64(username:password)` for basic auth) and
output is cut to a 256 KB preview. Spans carry piece, action, org and resource ids, never credentials. The
timeout fails the call but cannot abort the piece's in-flight request (Activepieces passes no abort signal);
it ends with the invocation.

## Shards

One Worker holding every piece would be 30.0 MB / 7.2 MB gzip (limit 10 MB gzip) and start about 1.4× slower
than today's runner, so the runtime is sharded: the same runner code (`apps/integrations/src/worker.ts`) is
deployed once per shard, each with only its shard's generated registry (`src/shards/<shard>.ts`).

| Shard | Worker | apps/api binding | Pieces | Bundle (raw / gzip) |
|---|---|---|---|---|
| `core` | `smartplane-runner` (`wrangler.jsonc`) | `INTEGRATIONS` | developer, collaboration, design, Google, Slack, ... | 21.2 MB / 5.2 MB |
| `business` | `smartplane-runner-business` (`wrangler.business.jsonc`) | `INTEGRATIONS_BUSINESS` | Microsoft 365, ERP, CRM | 11.2 MB / 2.5 MB |

- `curation.ts` assigns each piece a shard; the generator records it in the catalog (`IntegrationPiece.shard`)
  and writes one registry per shard. A test checks every registry holds exactly its shard's catalog pieces.
- `packages/integrations/src/shards.ts` maps each shard to its Worker name and binding. apps/api's
  `IntegrationRunner` looks up the piece's shard in the catalog and calls that binding (`routeToShard`); a
  shard without a binding serves nothing, and its pieces offer no tools. There is still one catalog for the
  API and the dashboard.
- Each runner Worker indexes only its own shard's catalog entries: a run for another shard's piece is an
  `UnknownAction` there.
- A new shard: add it to `IntegrationShard` (domain), `shardWorkers`, a `src/shards/<shard>.ts` entry, a
  wrangler config, and the `Bindings`/`wrangler.jsonc` service of apps/api; the type checker points at each
  place that maps shards.

## Security notes

- Credentials cross the service binding (Worker-to-Worker, never the internet) for one run, as `Redacted`
  values on both sides.
- The `http` piece can call any URL from the integrations Worker (including through an agent-supplied proxy
  and with agent-supplied Basic/Bearer credentials). Use an `api` resource (base URL and path allow-lists)
  for a known API; grant `http` sparingly, and remember argument constraints match exact values only.
- Every piece's generic `custom_api_call` (34 pieces, `write`) sends the connection's credential with the
  request. Its `url.url` must be a path relative to the provider's API base URL; absolute and
  scheme-relative URLs are refused (`InvalidInput`) by apps/api before guards and credentials, and again by
  the runner (`packages/integrations/src/actions/custom-api-call.ts`), so the credential never leaves the
  provider's host. The catalog types `url` as `{ url: string }` and says so in its description.
- pieces-common joins a relative path onto the base URL with a `/` in between, so a path such as `@evil.com`
  or `.evil.com` stays in the path even where the base is a bare origin (Salesforce's `instance_url`).
  Other piece inputs that are URLs check their host themselves (OneDrive's copy `monitorUrl`, Zoho CRM's
  `read-file`, Salesforce's `next_records_url`); Zoho CRM's `attachment_url` is stored by Zoho, not fetched
  with the token. Odoo's `custom_odoo_api_call` calls any model method over the connection's XML-RPC.
- Connection props that choose hosts are admin input: Microsoft `cloud` and Zoho `location` must be one of
  the piece's options (checked when the integration is saved and before each flow); Salesforce
  `environment`, Dynamics `hostUrl` (and its optional `proxyUrl`, which receives the access token) and
  NetSuite `accountId` are free text, like Zendesk's subdomain (the admin trust boundary, review #17).
- The managed OAuth token secret is an ordinary `secret` resource of the org. Anyone with `resources:manage`
  can reference it from another resource (as they can any secret); that is the existing admin trust boundary.
- `pieces-common` sets `NODE_TLS_REJECT_UNAUTHORIZED=0` in Node; it has no effect on Workers `fetch`, which
  always verifies TLS.
- Piece state lives in the runners' own KV namespace (`STORE`), never the API's `CACHE`: pieces are third-party
  code and `CACHE` holds the OAuth JWKS cache, so write access there could forge `/mcp` tokens. The deploy
  overlay check (`packages/deploy`) refuses a runner `STORE` id equal to the API's `CACHE` id.

## Not supported yet

- File inputs (24 actions), approval/wait actions (8), triggers (pieces' webhooks and polling).
- Some pieces wrap provider errors in their own message (Outlook: "... not authenticated (HTTP 401)"), so a
  rejected token surfaces as `UpstreamError` with `status: null` rather than `AuthFailed`.
- Live dropdown options (an extra catalog endpoint calling a piece's `options()` with the connection).
- OIDC and client-credentials-only OAuth2 connections; Google service-account (`custom`) connections are
  offered but untested in Workers.
- Retrying a run once after an `AuthFailed` with a forced OAuth refresh.

## Licensing

Activepieces is MIT-licensed outside `packages/ee/` and `packages/server/api/src/app/ee`; community pieces
live under `packages/pieces/community`, so every bundled piece is MIT. Each piece package also bundles its
own third-party dependencies (axios, zod, ...), under their own licenses. See `THIRD_PARTY_NOTICES.md`.

## Deploying

1. Deploy both runner Workers first (`bun run deploy` in `apps/integrations` runs `wrangler deploy` for
   `wrangler.jsonc` and `wrangler.business.jsonc`); then `apps/api`, whose `INTEGRATIONS` and
   `INTEGRATIONS_BUSINESS` service bindings point at `smartplane-runner` and
   `smartplane-runner-business`. Until the business Worker exists, its pieces simply offer no tools.
2. No migration is needed: `resources.kind` is free text and grant conditions are JSON.
3. Locally: `bunx wrangler dev -c apps/api/wrangler.jsonc -c apps/integrations/wrangler.jsonc -c
   apps/integrations/wrangler.business.jsonc --local` from the repo root runs all three, with the bindings
   connected. Copy `apps/integrations/.dev.vars.example`.

Bundle sizes (dry run; Workers limit 10 MB gzip): `core` runner 21.2 MB / 5.2 MB gzip, `business` runner
11.2 MB / 2.5 MB gzip, API 6.6 MB / 1.3 MB gzip. Startup (script parse and top-level evaluation, measured
relative to the previous single runner): `core` unchanged, `business` about 0.6× (pieces are evaluated
lazily, on their first run).
