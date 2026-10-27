# Set up a deployed service with a Smartplane machine token

Use this when the user gives you a machine token (`pcm_…`), or says one is in `SMARTPLANE_TOKEN`, and asks
you to set up a service so it gets its secrets from Smartplane. The token can do one thing: fetch the values
it was created for from `POST /api/secrets/deliver`. The service needs exactly one secret on its platform,
`SMARTPLANE_TOKEN`; everything else comes from Smartplane at boot.

The prompt usually looks like: `Use the smartplane skill to set up this service with Smartplane secrets.
Machine token: pcm_… (service: billing-api, platform: Vercel)`. `platform: detect it` means work it out
from the repository. `api: <url>` means a self-hosted Smartplane: also set `SMARTPLANE_API_URL` to it.

## Rules

- **Never write the token into the repository.** Not into a `.env` file, a Dockerfile (`ENV`, `ARG`),
  `fly.toml`, `wrangler.toml`/`wrangler.jsonc` `vars`, `vercel.json`, `railway.json`, a script, a test, a
  commit message or a PR description. It goes only into the platform's own secret store.
- **Never print a secret value.** Not the token beyond what the user already pasted, and never a delivered
  value. Verification lists names only.
- **Minimal edits.** Change only the start command or the entry file. Show the user a diff of every file you
  change before or right after you change it.
- **Leave `.env` files alone** unless the user asks you to remove them. When they ask, remove only the
  entries Smartplane now delivers, and say which.
- If `SMARTPLANE_TOKEN` in your shell holds a `pcm_` token, the `smartplane` CLI acts as that token: only
  `smartplane run` works. Run other `smartplane` commands with `env -u SMARTPLANE_TOKEN smartplane …`.

## 1. Detect the platform

Unless the user named one, look at the repository root (and the service's folder in a monorepo):

| File | Platform |
| --- | --- |
| `railway.json`, `railway.toml` | Railway |
| `vercel.json`, `.vercel/` | Vercel |
| `wrangler.toml`, `wrangler.jsonc`, `wrangler.json` | Cloudflare Workers |
| `fly.toml` | Fly.io |
| `Dockerfile` (and none of the above) | Docker: wherever the image runs |
| `Procfile` | Heroku-style process list (Render, Heroku, Railway also read it) |
| `package.json` `scripts.start` / `scripts.build` | The command to wrap; Next.js (`next`) often means Vercel |

If two match (a `Dockerfile` and a `fly.toml`), the platform file wins. If none match, or the signals
disagree, ask the user which platform runs the service. Do not guess.

## 2. Store `SMARTPLANE_TOKEN` in the platform's secret store

Use the platform's CLI when it is installed and logged in (`railway whoami`, `vercel whoami`,
`npx wrangler whoami`, `fly auth whoami`). Otherwise give the user the dashboard steps and wait for them to
confirm. Prefer commands that prompt for the value or read it from your environment, so the token is not in
a command line you show.

| Platform | CLI | Dashboard |
| --- | --- | --- |
| Railway | `railway variable set SMARTPLANE_TOKEN="$SMARTPLANE_TOKEN"` (`-s <service>` to pick one; `--skip-deploys` to not redeploy yet) | Service → Variables → New Variable |
| Vercel | `vercel env add SMARTPLANE_TOKEN production` (prompts; Production variables are Secret by default). Repeat for `preview` if previews need it. Changes apply to new deployments only. | Project → Settings → Environment Variables → Add, type Secret |
| Cloudflare Workers | `npx wrangler secret put SMARTPLANE_TOKEN` (prompts; deploys a new version at once). With gradual deployments: `npx wrangler versions secret put SMARTPLANE_TOKEN` | Workers & Pages → the Worker → Settings → Variables and Secrets → Add, type Secret |
| Fly.io | `fly secrets set SMARTPLANE_TOKEN="$SMARTPLANE_TOKEN"` (redeploys; add `--stage` to wait for the next deploy) | App → Secrets |
| Docker | `docker run -e SMARTPLANE_TOKEN …` passes it from the host's environment; in Compose, `environment: [SMARTPLANE_TOKEN]` with no value does the same | The orchestrator's secret settings (Kubernetes Secret, ECS secret, …) |

If the token was pasted into the chat and is not in your environment, you may use it in that one command.
Then remind the user, once, that the token is now in this transcript: if the transcript is shared, revoke
or rotate it (`smartplane machine-tokens revoke <name>` and create a new one). Do not repeat the reminder.

## 3. Make the service fetch its values at boot

Pick one, by platform:

- **A start command you control** (Railway, Fly.io, Docker, Render, a VM, `Procfile`): wrap it.

  ```sh
  smartplane run --purpose boot -- <the existing start command>
  ```

  - Railway: Settings → Deploy → Custom Start Command, or `deploy.startCommand` in `railway.json`.
  - Fly.io: the Dockerfile's `CMD`, or a `[processes]` entry in `fly.toml`
    (`app = "smartplane run --purpose boot -- node server.js"`).
  - Docker: `CMD ["smartplane", "run", "--purpose", "boot", "--", "node", "server.js"]`.
  - `Procfile`: `web: smartplane run --purpose boot -- <command>`.

  The image or runtime needs the `smartplane` CLI on `PATH`, or `npx smartplane` in a Node service. For a
  project-scoped token, pass `--project prj_…` (an id, not a name). The command gets the values in its
  environment; `SMARTPLANE_TOKEN` itself is removed from it. Works for any language.

- **No start command** (Vercel Functions, Cloudflare Workers) or the user prefers code: the
  `@smartplane/secrets` SDK. It is not on npm yet; tell the user it is coming soon, write the code, and do
  not add an install line or a dependency they cannot install. Otherwise use the CLI path.

  - Node or Bun with an entry file: `await loadSecrets()` before anything reads `process.env`.
  - Vercel: start it at module scope, await it in handlers:

    ```ts
    // lib/secrets.ts
    import { loadSecrets } from "@smartplane/secrets"
    export const secretsReady = loadSecrets()
    secretsReady.catch(() => {}) // handlers await it and see the error
    ```

    Values load once per cold start; a warm instance keeps them, so a rotated secret arrives at the next
    cold start (or pass `refreshEvery`). If the **build** needs secrets, set the Build Command to
    `smartplane run -- next build`, and only when the CLI is installed in the build.
  - Cloudflare Workers: secrets arrive on `env`, not `process.env`, and there is no start command, so
    `smartplane run` does not apply. Cache per isolate and fetch inside the handler:

    ```ts
    import { createSecretsCache } from "@smartplane/secrets"
    const secrets = createSecretsCache({ maxAgeMs: 5 * 60_000 })
    export default {
      async fetch(request: Request, env: { SMARTPLANE_TOKEN: string }) {
        const values = await secrets.get({ token: env.SMARTPLANE_TOKEN })
      }
    }
    ```

    This is `loadSecrets({ token: env.SMARTPLANE_TOKEN, target: "none" })` with a cache; it never touches
    `process`. Do not use `refreshEvery` in a Worker.

Show the diff. Then, if the platform held the real secrets as variables, tell the user they can delete those
there once the service boots with Smartplane. Do not delete them yourself unless asked.

## 4. Verify, names only

When the token is in your environment (`SMARTPLANE_TOKEN`), run:

```sh
smartplane run --purpose boot --dry-run
```

It lists the env names the service would receive, never values. Compare them with what the code reads
(`process.env.X`, `env.X`, `os.environ["X"]`). A name the code needs that is missing means the token's
allow-list lacks it, or the secret is not deliverable: tell the user to ask an admin to add it to the
token or mark it deliverable. Do not work around it with a `.env` value.

If the platform's CLI can show logs, check the first deploy for `smartplane:` notices (an expired token, a
name not delivered). Never echo, log or print a value to prove it arrived.

## 5. Report

Say, briefly: the platform, where `SMARTPLANE_TOKEN` was stored (or the steps left for the user), the
diff, the verified env names, and what is left (delete the old platform variables, renew the token before
it expires, rotate it if this transcript is shared).
