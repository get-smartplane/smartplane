# @smartplane/secrets

Load the secrets and variables your service may use from [Smartplane](https://app.smartplane.dev) into
`process.env` when it boots. Optionally, refresh them on an interval, so a rotated secret takes effect
without a restart.

- No runtime dependencies and no Node built-ins. It uses plain `fetch` and works on Node 18+, Bun, Cloudflare
  Workers and other fetch-based runtimes. The bundle is about 3 KiB gzipped.
- Values are kept in memory only. The library never writes them to disk, caches them or logs them.
- Errors are typed, and the token never appears in an error message.

```sh
npm install @smartplane/secrets     # or: bun add @smartplane/secrets
```

## Get a token

A service authenticates with a **machine token** (`pcm_…`). A machine token can do one thing: receive the
values it was created for.

```sh
smartplane machine-tokens create --name api-prod --project api --allow DATABASE_URL,STRIPE_KEY --expires 30d
```

The token is printed once. Store it in your platform's secret settings as `SMARTPLANE_TOKEN`. It is the only
secret the platform has to hold.

## Node

Load the values before anything reads them. Top-level `await` in an ES module works:

```js
// server.mjs
import { loadSecrets } from "@smartplane/secrets"

await loadSecrets()                      // SMARTPLANE_TOKEN from the environment, purpose "boot"
const { default: app } = await import("./app.mjs")   // import after loading, so app code sees the values
app.listen(process.env.PORT)
```

CommonJS:

```js
const { loadSecrets } = require("@smartplane/secrets")

loadSecrets().then(() => require("./app").listen(process.env.PORT))
```

## Bun

```ts
import { loadSecrets } from "@smartplane/secrets"

await loadSecrets({ names: ["DATABASE_URL", "STRIPE_KEY"] })
Bun.serve({ port: Number(process.env.PORT), fetch: (await import("./app")).default })
```

## Vercel Functions

Functions have no start command, so start loading at module scope and await it in the handler. Module scope
runs once per cold start, and a warm instance (Fluid compute reuses one across invocations) keeps the values:

```ts
// lib/secrets.ts, imported by every route that needs a value
import { loadSecrets } from "@smartplane/secrets"

export const secretsReady = loadSecrets()          // SMARTPLANE_TOKEN from the project's environment variables
secretsReady.catch(() => {})                       // handlers await it and see the error; this stops an early
                                                   // failure from crashing the instance as an unhandled rejection

// app/api/charge/route.ts
import { secretsReady } from "@/lib/secrets"

export async function POST(request: Request) {
  await secretsReady                               // process.env.STRIPE_KEY is set from here on
}
```

A long-lived instance only sees a rotated value after its next cold start. If that is too slow, pass
`refreshEvery` (the timer is `unref`'d and only runs while the instance does), or use `createSecretsCache`
below and call `get()` per request. Add the token with `vercel env add SMARTPLANE_TOKEN production`.

## Cloudflare Workers

A Worker gets its secrets through `env`, not `process.env`, and has no start command. Create a cache at
module scope and read it in the handler; it calls `loadSecrets` with `target: "none"`, so it never touches
`process`, and it fetches again once the values are older than `maxAgeMs`:

```ts
import { createSecretsCache } from "@smartplane/secrets"

const secrets = createSecretsCache({ maxAgeMs: 5 * 60_000 })

export default {
  async fetch(request: Request, env: { SMARTPLANE_TOKEN: string }) {
    const { STRIPE_KEY } = await secrets.get({ token: env.SMARTPLANE_TOKEN })
    return new Response("ok")
  }
}
```

Store the token with `wrangler secret put SMARTPLANE_TOKEN`. The cache lives as long as the isolate, which
Cloudflare may evict at any time, so a cold isolate fetches once more. If a refetch fails, the previous values
are served (and `onError` is called), except after a 401 or 403: a revoked token stops serving at once. Do
not use `refreshEvery` in a Worker; timers do not outlive the request. A single `loadSecrets({ token:
env.SMARTPLANE_TOKEN, target: "none" })` works too, if you cache its result yourself.

## Railway

1. Create a machine token (see above) and add it to the service's variables as `SMARTPLANE_TOKEN`.
2. Choose one of these:
   - **SDK:** call `loadSecrets()` at the top of your entry file, as shown above. The start command does not change.
   - **No code change:** set the start command to `npx smartplane run --purpose boot -- node server.js`. Use this for
     any language.

## Rotation

```ts
const secrets = await loadSecrets({
  refreshEvery: 5 * 60_000,                       // every 5 minutes, ±10% jitter
  onRefresh: ({ changed, removed }) => {
    if (changed.includes("DATABASE_URL")) pool.reconnect(process.env.DATABASE_URL)
  },
  onError: (error) => logger.warn({ error: error.name }, "secret refresh failed; keeping current values")
})

process.on("SIGTERM", () => secrets.stop())       // or pass `signal` and abort it
```

On each refresh, the returned `env` object and `process.env` are updated in place. If a name is no longer
delivered (for example, its grant was revoked or expired), it is deleted from both. A failed refresh keeps the
current values and calls `onError`. If the token is rejected (401), refreshing stops. The timer is `unref`'d,
so it never keeps the process alive.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `token` | `process.env.SMARTPLANE_TOKEN` | A `pcm_` machine token or a `pc_` personal token |
| `apiUrl` | `process.env.SMARTPLANE_API_URL`, then `https://app.smartplane.dev` | |
| `names` | everything the token may receive | Requested names that are not delivered are listed in `denied` |
| `projectId` | the token's project | |
| `target` | `"process.env"` | Use `"none"` to only return the values |
| `override` | `false` | By default, a variable the platform already set wins. Set `true` to let Smartplane values replace it. |
| `refreshEvery` | off | In milliseconds, minimum 1000 |
| `onRefresh`, `onError` | | Refresh callbacks |
| `signal` | | Aborts the first load and stops refreshing |
| `fetch` | `globalThis.fetch` | For runtimes or tests that bring their own |
| `retries` | `3` | Retries for the first load after network errors, 5xx responses and 429 responses, with backoff. A 429 waits for the time in its `Retry-After` header. |

`loadSecrets` returns `{ env, denied, expiresAt, refused, stop }`. `refused` lists names the SDK skipped (with a
`console.warn`) because they change how programs load code (`NODE_OPTIONS`, `LD_*`, `PATH`, ...); Smartplane never
delivers them, so they appear only if the server or its reply was tampered with.

`createSecretsCache` takes `token`, `apiUrl`, `names`, `projectId`, `retries`, `fetch`, `maxAgeMs` (default
5 minutes, minimum 1 second) and `onError`; `get()` takes the same load options per call and returns the values.

## Errors

Every error extends `SmartplaneError`, which has an optional `status`.

| Class | When |
| --- | --- |
| `UnauthorizedError` | No token was found, or the API answered 401. Not retried. |
| `ForbiddenError` | The API answered 403: the token may not receive these values. Not retried. |
| `RateLimitedError` | The API still answered 429 after all retries. `retryAfterMs` holds the last wait the API asked for. |
| `NetworkError` | The API was unreachable, timed out (10 s per attempt) or answered 5xx, after all retries. |
| `InvalidResponseError` | The API answered 400, or sent a reply this version cannot read. |

## Other languages

Python, Go and other languages do not have an SDK yet. Use the CLI for now: `smartplane run -- <command>`
injects the same values into any process. On a platform's start command, use
`smartplane run --purpose boot -- <command>`. See [docs/cli.md](../../docs/cli.md).

## Why the response is checked by hand

Smartplane decodes every value that crosses a boundary with a schema. This package stays dependency-free, so
instead of shipping a schema library it checks the delivery response with a small hand-written guard
(`src/response.ts`). A malformed reply raises `InvalidResponseError` and never sets partial values.
