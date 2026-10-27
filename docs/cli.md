# smartplane CLI

`smartplane` manages a Smartplane org from a terminal or a CI job. It does what the dashboard does: resources,
grants, guard rules, approvals, tokens, members and the audit log. It also connects MCP clients to the
gateway, syncs skills into local skill folders, and runs commands with your secrets in their environment. It talks to the same typed API as the dashboard
(`PrimitiveApi` in `packages/domain`), so it sees exactly what your role allows.

## Install

```sh
npx smartplane --help              # Node 20+, no install
bunx smartplane --help             # Bun
npm install -g smartplane          # puts `smartplane` on PATH
```

Single-file binaries (no runtime needed) are built for linux-x64, linux-arm64, darwin-arm64, darwin-x64 and
windows-x64:

```sh
cd apps/cli
bun run build                      # dist/bin/smartplane-<os>-<arch>, plus the npm package in dist/npm
bun run build --target linux-x64   # one platform only
bun run build:npm                  # just dist/npm; publish with `cd dist/npm && npm publish`
```

From a checkout, `bun run apps/cli/src/bin.ts <command>` runs the source directly.

## Set up a machine and a repository: `smartplane init`

```sh
smartplane init                    # guided; run it again any time, it only offers what is missing
smartplane init --yes --clients claude-code --skills local --hook
smartplane init --yes --project api --import-env .env.local --patch-scripts --json
```

`init` runs six steps. Each one looks at what is already in place first, so a second run only reports
(`=`) what an earlier run set up and offers what is still missing.

1. **Sign in.** Reuses a working login (`SMARTPLANE_TOKEN`, then the profile) and says who you are and in
   which org. Without one, it runs the `login` paste-token flow. `--profile` and `--api-url` work as usual.
2. **Project.** Pick one of the org's projects, or none. The choice is saved in `.smartplane/project.json`
   at the repository root (below). `init` asks whether to commit it; answering no adds `.smartplane/` to
   `.gitignore`. `--project <slug|name|id>` picks without asking.
3. **Clients.** Detects Claude Code (`claude` on PATH or `~/.claude`), Cursor (`~/.cursor`), VS Code
   (`code` on PATH or its user settings folder) and Claude Desktop (its config folder for this OS), and
   preselects those. Each chosen client is connected exactly as `smartplane connect <client>` does it: OAuth,
   so no token is written, and only the `smartplane` entry changes. Every change is shown as a diff. Claude
   Code and VS Code use the project's file; Cursor asks whether to use `~/.cursor/mcp.json` or the project's
   (`--local`); Claude Desktop has one file per user. A file that is not plain JSON is refused, not
   rewritten. Once one client is connected, later runs offer only clients that look installed.
4. **Skills.** Offers `skills sync` into the project's `.claude/skills` and `.agents/skills`, or your home
   folder's. Copies work offline with their scripts, but a revoked skill stays on disk until the next sync.
   For Claude Code in a project it also offers the `SessionStart` hook that re-syncs.
5. **Secrets.** Looks for `.env`, `.env.local` and `.env.*` (not `.example`, `.sample`, `.template`) in
   the current folder and warns about each one git tracks: its values are in the history and should be
   rotated. It then offers to move the values of the files you pick into Smartplane:
   - Each name is classified as a **secret** (by name: `KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE`, `DSN`,
     `AUTH`, `DATABASE_URL`, `REDIS_URL`, ...; a URL with credentials; or a long random-looking value) or a
     **variable** (everything else, and framework public prefixes such as `NEXT_PUBLIC_` and `VITE_`). You
     see the list and can change it. Values are never printed: only names and masked previews such as
     `sk_l…(51 chars)` (values under 16 characters show only their length).
   - Names already in Smartplane (a resource of that name, or a secret or variable delivered under that env
     name in the same scope) are skipped and reported.
   - Secrets and variables are created with `POST /api/resources` under their env name, in the project from
     step 2. After one confirmation, secrets are marked `deliverable` (`PATCH /api/resources/:id/delivery`)
     and, if you may grant (`grants:manage`), you get a `use` grant on them, so `smartplane run` delivers them
     to you. Creating needs `resources:manage`; without it the step is skipped with that reason.
   - The `.env` files are never changed or deleted. `init` prints the next steps instead: run your app as
     `smartplane run -- npm run dev`, then delete the file yourself once that works. It offers to wrap the
     `dev`, `start`, `serve` and `preview` scripts in `package.json` (shown as a diff, applied after a yes);
     scripts that chain commands (`&&`, `|`, `;`) are left for you to wrap.
6. **Verify.** Lists tools over MCP as you, the way an agent sees them ("N tools available to you", or a
   pointer to the dashboard when there are none), and runs the equivalent of `smartplane run --dry-run` to
   list the env names that would be injected. Then it prints a summary of every step and the next commands.

**Without a terminal** (a pipe, CI with `CI` set) `init` never asks: it exits 2 unless you pass `--yes`.
With `--yes` every question takes its default, and the steps that create org resources or edit your files
beyond client configs need their own flag:

| Flag | Effect |
| --- | --- |
| `--yes`, `-y` | Take each default: the detected clients, skills synced into the project, project file committed |
| `--project <p>` | Save this project in `.smartplane/project.json` |
| `--clients a,b` | Connect these clients: `claude-code`, `cursor`, `vscode`, `claude-desktop` |
| `--local` | Cursor: the project's `.cursor/mcp.json` |
| `--skills local\|global\|none` | Where to sync skills |
| `--hook` | Add the Claude Code `SessionStart` hook |
| `--import-env <file>` | Move this file's values into Smartplane; its secrets become deliverable |
| `--no-import-env` | Do not offer to move `.env` values |
| `--patch-scripts` | Apply the `package.json` change |

`--json` prints the summary as one JSON document (identity, project, client changes, skill sync reports,
hook, created and skipped names, verification and next steps), with no values in it. `init` exits 1 when a
step failed (a config it refused to rewrite, a verification that could not reach the gateway).

### `.smartplane/project.json`

```json
{ "projectId": "prj_01J...", "apiUrl": "https://smartplane.internal" }
```

The project this repository belongs to; `apiUrl` is only written for a Smartplane other than the hosted
one. It holds ids, never a token or a value, so it is safe to commit. `run`, `secrets env` and `skills sync`
use it when `--project` is not given; a file written for another Smartplane is ignored with a note.

## Log in

```sh
smartplane login                   # opens https://app.smartplane.dev/tokens; paste the token (input is hidden)
smartplane whoami
smartplane logout [--revoke]       # --revoke also revokes the token on the server
```

Create a personal access token on the tokens page and paste it. The CLI checks it against `/api/me`, then
saves it in `~/.config/smartplane/credentials.json`, or `%APPDATA%\smartplane` on Windows. The file is mode
0600 and its folder 0700. You can also pipe the token in: `echo "$TOKEN" | smartplane login`.

Profiles hold several logins, such as a self-hosted instance or a local API:

```sh
smartplane login --profile local --api-url http://localhost:8787
smartplane --profile local resources ls          # or SMARTPLANE_PROFILE=local
```

Each setting is taken from the first of these that is set:

| Setting | Order |
| --- | --- |
| token | `SMARTPLANE_TOKEN`, then the profile |
| API URL | `--api-url`, then `SMARTPLANE_API_URL`, then the profile, then `https://app.smartplane.dev` |
| profile | `--profile`, then `SMARTPLANE_PROFILE`, then `default` |

## Output and exit codes

Every command prints a table or a short summary. Add `--json` to any command to get the API's own JSON
encoding instead: ISO timestamps, `_tag`ged unions, the same field names as the HTTP API. A list command
prints one JSON array. `audit tail --json` prints NDJSON, one event per line. Notes and warnings go to stderr,
so stdout stays clean for pipes. Global flags (`--json`, `--profile`, `--api-url`) can go before or after the
subcommand.

| Exit code | Meaning |
| --- | --- |
| 0 | success |
| 1 | error: the API refused (not found, conflict, forbidden, policy), the API was unreachable, or a broken audit chain |
| 2 | usage: unknown command, bad or missing flag, or a confirmation that could not be asked |
| 3 | authentication: no token, or the token is invalid, expired or deprovisioned |

`smartplane run` exits with its command's status instead. That is the command's own exit code, or 128+n
when signal n killed it (130 for SIGINT, 143 for SIGTERM). It exits 127 when the command was not found and
126 when the command could not be started. Before the command starts, `run` uses the codes above: 2 for a
requested name that was not delivered, 3 for a rejected token.

Errors are one line, with a hint when there is a next step:

```
error: Not allowed: this needs the "grants:manage" permission.
error: "db" matches 2 resources:
  db (database)  res_01...
  db (variable)  res_02...
hint: Pass the id instead.
```

Wherever a command takes a resource, team, member, token, rule or project, it accepts a name (or slug or
email) as well as an id. A name that matches more than one thing is refused, and the error lists the
matching ids.

## Commands

### Connect an MCP client

```sh
smartplane connect claude-code     # ./.mcp.json
smartplane connect cursor          # ~/.cursor/mcp.json (--local for ./.cursor/mcp.json)
smartplane connect vscode          # ./.vscode/mcp.json
smartplane connect claude-desktop  # Claude Desktop's config file for this OS, through mcp-remote
smartplane connect print           # print every snippet, write nothing
```

By default the entry has no credentials. The client discovers OAuth and signs in through your identity
provider. `--token` mints a new personal token just for that client config (named
`smartplane connect <client>`, `--ttl` up to 90d) and embeds it. It never embeds the CLI's own login token.
When a token is embedded, the file is made owner-only. The CLI warns when that file sits in a project
folder that could be committed.

`connect` only adds or replaces its own `smartplane` entry (rename it with `--name`). Other servers and
settings stay exactly as they were. A file it cannot rewrite faithfully, such as JSON with comments, is
refused rather than overwritten. `--dry-run` prints the change as a diff and writes nothing. `--file`
writes to another path.

### Resources and integrations

```sh
smartplane resources ls [--kind mcp-server|tool|skill|database|api|integration|secret|variable] [--project <p>]
smartplane resources add mcp-server --name github --url https://mcp.example.com/mcp [--transport http|sse] [--auth-secret <secret>]
smartplane resources add tool --name gh-issues --server github --tool-name create_issue
smartplane resources add api --name stripe --base-url https://api.stripe.com --auth-secret stripe-key --methods GET,POST --paths /v1/customers
smartplane resources add database --name analytics --engine postgres --connection-secret analytics-url [--read-write]
smartplane resources add skill --name release-notes --description "Use when ..." --file notes.md   # or --repo owner/repo [--path --ref] or --url
smartplane resources add integration --name github --piece github --auth secret-text --secret github-pat [--actions a,b]
smartplane resources add variable --name region --value eu-west-1
printf %s "$STRIPE_KEY" | smartplane resources add secret --name stripe-key
smartplane resources rm <name|id> [--yes]

smartplane integrations ls [--search git] [--category ...]
smartplane integrations show github
```

Secret values are read only from stdin or from a hidden prompt, never from flags, where they would end up
in shell history and `ps`. `resources add integration --auth oauth2 --client-id ... --client-secret <secret>`
prints the URL that authorizes the connection.

### Grants

```sh
smartplane grants ls [--resource <r>] [--to <subject>]
smartplane grants add --to team:platform --resource github --level use [--tools create_issue,list_issues] [--expires 30d]
smartplane grants revoke <grant-id>
```

`--to` takes `team:<slug>`, `user:<email>`, `role:<slug>` or `token:<service-account name|id>`. `--level` is
one of `read`, `use`, `write` or `admin`, and each level includes the ones before it. `--expires` takes a
duration (`12h`, `30d`, `2w`) or a date (`2026-12-31`).

### Rules (guards), approvals

```sh
smartplane rules ls
smartplane rules get <rule>
smartplane rules add "Nobody deletes reports from the Q3 folder" --mode enforce|monitor|approval [--threshold 0.7] [--resources a,b] [--no-wait]
smartplane rules test <rule> --tool drive__delete_file --args '{"path":"/Q3/r.pdf"}' [--role member] [--teams a,b]
smartplane rules verify <rule> [--no-wait] [--continue]
smartplane rules activate|disable <rule>

smartplane approvals ls
smartplane approvals approve|reject <approval-id> [--comment "..."]
```

`rules add` creates the rule and verifies it: a background run finds the tools it applies to, writes and
reviews the classifier's check, and tests it on example calls. The command prints each stage as it starts
and the outcome (`--no-wait` returns as soon as the run is queued; `rules get` shows where it is). If the
rule names something specific and the lookup finds candidates, the run waits for you to pick one in the
dashboard, or `rules verify <rule> --continue` tests it without pinning. The rule stays a draft until someone
reviews it and runs `rules activate`. You cannot approve your own request.

### Tokens and members

```sh
smartplane tokens ls [--all]
smartplane tokens create --name ci --kind personal|service-account [--ttl 30d] [--project <p>]
smartplane tokens revoke <name|id> [--all]

smartplane members ls
smartplane members invite ana@acme.com [--role member]
smartplane members offboard <email|membership-id> [--yes]
```

`tokens create` prints the token once, alone on stdout, so `TOKEN=$(smartplane tokens create ...)` works.
`members offboard` runs the single offboarding path. It ends the membership, revokes the member's tokens and
direct grants, and removes them from teams. It asks for confirmation first. Without a terminal it refuses
unless you pass `--yes`.

### Machine tokens

```sh
smartplane machine-tokens ls
smartplane machine-tokens create --name api-prod --project api --allow DATABASE_URL,STRIPE_KEY --expires 30d [--platform vercel]
smartplane machine-tokens renew api-prod [--expires 30d]
smartplane machine-tokens revoke api-prod
```

A machine token (`pcm_…`) is the credential for a deployed service. It can do one thing: receive the
secrets and variables listed in `--allow` from `POST /api/secrets/deliver`. Every other endpoint refuses it.
It belongs to the org, not to you, so it keeps working after you leave. That is why access reviews list
machine tokens. `--allow` takes resource names, env names or ids. `--expires` takes a lifetime from now
(`30d`, `2w` or a date) of at most 90 days, and defaults to 90 days. `renew` resets the expiry to that
lifetime from now. `create` prints the token once, alone on stdout, like `tokens create`.

`create` also prints, on stderr, a prompt for your coding agent, whose built-in `smartplane` skill
(`references/deploy.md`) then does the setup: it detects the platform, stores `SMARTPLANE_TOKEN` in the
platform's secret store, wraps the start command or adds `loadSecrets()`, and verifies with
`smartplane run --dry-run`. `--platform railway|vercel|cloudflare-workers|fly|docker` names the platform in
the prompt; without it the agent detects it. The prompt never contains the token: it tells the agent the
token is in `SMARTPLANE_TOKEN`, which you set in the shell you start the agent from
(`export SMARTPLANE_TOKEN=$(smartplane machine-tokens create ...)` does both at once). With a `pcm_` token in
`SMARTPLANE_TOKEN`, that shell's `smartplane` acts as the token, so only `smartplane run` works there.
`--json` adds the same text as `agentPrompt` next to the API's fields; the token is only in `plaintext`.
The dashboard shows the same prompt, and can put the token in it for pasting into the agent's chat.

### Audit log

```sh
smartplane audit tail [-n 20] [--follow] [--type policy.denied] [--interval 2]
smartplane audit verify [--from-seq N]
smartplane audit export --from 2026-07-01 --to 2026-10-01 > q3.ndjson
```

`tail --follow` polls with the `after` cursor and catches up page by page after a busy interval.
`verify` re-hashes the chain and exits 1 if the chain is broken. `export` writes NDJSON evidence. `--from`
and `--to` take dates or durations into the past (`--from 30d`). `--to` defaults to now.

### Run a command with secrets

```sh
smartplane run -- npm test
smartplane run --only STRIPE_KEY,DATABASE_URL -- node server.js
smartplane run --project api --dry-run            # which names would be injected (never the values); --project defaults to .smartplane/project.json
smartplane run --purpose boot -- node server.js   # a deployed service's start command
smartplane run --no-scrub -- psql "$DATABASE_URL" # an interactive program that needs the terminal
```

`run` fetches the secrets and variables you may receive from `POST /api/secrets/deliver`. It authenticates
with your login, or with `SMARTPLANE_TOKEN` when that is set. It then starts the command with your
environment plus those values. A delivered value takes precedence over a variable already set, and `run`
names every variable it overrides on stderr. `SMARTPLANE_TOKEN` itself is removed from the command's
environment: the command gets the values, not the means to fetch more. Only secrets an admin marked
deliverable are sent. Everything else stays behind the gateway.

- **Nothing touches disk.** Values are held in memory for as long as the command runs. They are never
  written to a temp file, a cache or the credentials file. `run` itself never prints a value: `--dry-run`
  and `--json` show names and kinds only.
- **stdin, signals, exit code.** stdin is passed through. SIGINT, SIGTERM, SIGHUP and SIGQUIT sent to
  `smartplane` are forwarded to the command. `run` exits with the command's status (see
  [Output and exit codes](#output-and-exit-codes)). In a terminal, Ctrl-C and Ctrl-\ already reach the command
  directly, because it shares the terminal's process group, so `run` does not send those a second time.
- **Names that are not delivered.** With `--only`, every requested name that was not delivered is listed
  in one notice, for example `smartplane: not delivered: STRIPE_LIVE_KEY (no grant), FOO (unknown)`. The
  reasons are `no grant`, `not deliverable` (a secret that is not marked deliverable), `denied by policy`
  (a guard refused it) and `unknown`. Then `run` exits 2 without starting anything. Add `--allow-missing`
  to run anyway. Add `--placeholders` as well to set each missing name to `smartplane:denied:NAME`, so the
  program fails loudly where it uses the value. `--only` takes env names (`STRIPE_KEY`, not `stripe-key`).
- **Errors.** A rejected token exits 3 with a hint to run `smartplane login` or set `SMARTPLANE_TOKEN`. On
  a 429, `run` waits for the time in the `Retry-After` header (at most 60s), tries once more, and then fails.

#### Scrubbing secrets from output

By default, the command's stdout and stderr pass through a scrubber. It replaces every delivered
**secret** with `[smartplane:NAME]`. Variables are not secret, so they are not scrubbed. The scrubber
matches each secret in these forms:

- the raw value;
- its base64, in both the standard and URL-safe alphabets, with and without padding. It also finds the
  value inside a longer base64 string at any alignment, such as `Authorization: Basic base64(user:secret)`;
- its URL encoding (`%20` or `+` for spaces, and either case of hex digits);
- its JSON-escaped form, including the `\uXXXX` and `\/` variants.

The scrubber works on bytes. A secret split across two writes is still caught, and output that cannot be
the start of a secret is passed on at once, so prompts are not delayed. When two secrets overlap in the
output, the whole span is replaced.

Caveats:

- **Short values are not scrubbed.** Hiding a value shorter than 6 characters, such as `1234`, would also
  hide ordinary words and numbers. `run` lists such names in one notice:
  `smartplane: not scrubbed from output (shorter than 6 characters): PIN`.
- **Scrubbing is a safety net, not a boundary.** It catches the usual accidents: a debug print, a stack
  trace, a logged connection string or header. A program that transforms a value (hashes it, reverses it,
  encrypts it, or prints it one character at a time with other output in between) gets past the scrubber.
  So does a program that writes the value to a file or sends it over the network. Run only commands you
  trust with the secret.
- **Only stdout and stderr are scrubbed.** Files the command writes, and anything it sends elsewhere, are
  not.

#### Scrubbing and the terminal

The scrubber has to sit between the command and your terminal, so the command writes into pipes rather
than the terminal itself. Most programs work the same way through a pipe. A program that checks for a
terminal behaves differently: colours and progress bars may switch off, and full-screen or line-editing
programs (`psql`, `vim`, `top`, REPLs, password prompts) may not work at all. stdin is still the terminal.

For those programs, use `--no-scrub`. The command then gets your terminal directly, and its output is not
scrubbed. When no secret is long enough to scrub, the command gets the terminal anyway.

#### On a platform (Railway, Fly, Render, ...)

Create a machine token for the service (see [Machine tokens](#machine-tokens)) and store it as
`SMARTPLANE_TOKEN` in the service's variables. Then set the start command:

```sh
smartplane run --purpose boot -- node server.js       # Railway start command, e.g. via npx smartplane
```

`--purpose boot` tells Smartplane that a service is starting, rather than a person running a command. A machine
token can only call the delivery endpoint, so pass `--project` as an id (`prj_…`), not a name. When the
token expires within 7 days, `run` warns on stderr. For Node and Bun services, the
[`@smartplane/secrets`](../packages/secrets-sdk/README.md) SDK does the same from inside the process, and
can refresh rotated values without a restart.

### Print secrets as dotenv or JSON

```sh
smartplane secrets env --format dotenv --i-understand-this-writes-plaintext > .env.local
smartplane secrets env --format json --only STRIPE_KEY --i-understand-this-writes-plaintext | jq .
```

`secrets env` prints the values you may receive, in plaintext. Plaintext ends up in files, shell history
and backups, so the command refuses to run without `--i-understand-this-writes-plaintext`. Without the
flag, it explains why and exits 2. Prefer `smartplane run`. The CLI never writes the file itself; you
redirect stdout. `--project`, `--only` and `--allow-missing` work as they do for `run`.

### Skills on disk

```sh
smartplane skills ls
smartplane skills sync [--global] [--target claude|agents|both] [--project <p>] [--dry-run] [--force] [--quiet]
smartplane connect claude-code --sync-skills [--no-hook]
```

`skills sync` writes every skill you may read as a folder: `<dir>/<slug>/SKILL.md`, plus the skill's
scripts, references and assets. Scripts keep their executable bit. The folders go into `.claude/skills/`
(Claude Code) and `.agents/skills/` (the Agent Skills convention used by `npx skills`, Codex and others).
Those are created at the git root by default, or under your home directory with `--global`. Skills are
fetched through the MCP endpoint with your token (`resources/list` and `resources/read` on
`skill://<slug>/...`). You get exactly what your grants allow, and every read is audited. The built-in
`smartplane` skill (see [skills.md](skills.md#the-built-in-smartplane-skill)) is always among them.
`--project` (default: `.smartplane/project.json`) narrows the sync to org-wide skills plus that project's,
by sending the `x-smartplane-project` header. A `SKILL.md`
without frontmatter gets standard frontmatter (`name`, `description`, `metadata.managed-by: smartplane`)
and, if the skill declares arguments, a short **Arguments** section so the agent knows to ask for them.

Each skills directory has a `.smartplane.json` manifest listing the folders Smartplane wrote and a hash of
every file in them. Sync uses it to stay out of everything else:

- It **creates** granted skills, **updates** ones whose server version changed, and skips unchanged ones
  without downloading them again.
- It **deletes** folders whose skill is no longer granted (revoked, expired or removed).
- It **never touches** folders it did not write: your own skills, or skills listed in `skills-lock.json`
  by `npx skills`. If such a folder has the same name as a granted skill, sync reports a conflict.
- A Smartplane folder that someone edited locally is left alone and reported as a conflict. Delete it, or
  pass `--force` to overwrite it.
- File paths from the server are checked before anything is written. A skill with an absolute path, a
  `..` segment or a backslash is skipped as a whole.
- The manifest is checked the same way, because it is committed with the repository and sync deletes the
  files it lists. A manifest with an unsafe folder name or file path (absolute, `..`, backslash) is treated
  as corrupt: sync reports it and stops before touching any skills directory.
- Sync never writes or deletes through a symbolic link. Before every write and remove it checks that no
  path component is a link and that the real path stays inside the skills directory, and it opens files
  with `O_NOFOLLOW`. A managed folder that is, or contains, a link is reported as a conflict (or kept, when
  the skill is no longer granted), even with `--force`.
- In a project, `.claude`, `.agents` or a `skills` directory that is a symbolic link is refused, since the
  repository controls that layout. Under `--global` the skills directory is in your own home, so a link
  there (for example into a dotfiles repository) is your choice and is followed; everything below it gets
  the same checks.

`connect claude-code --sync-skills` runs one sync into `.claude/skills/`. It also adds a Claude Code
`SessionStart` hook (`smartplane skills sync --quiet --target claude`) to the project's
`.claude/settings.json`. Existing hooks and settings are kept, and running it again adds nothing.
`--no-hook` skips the hook.

**Trade-off.** Synced folders are copies. A revoked skill disappears at the next sync: the next Claude Code
session when the hook is installed, otherwise the next time you run `skills sync`. Until then, an agent can
still read the copy on disk. Skills served as MCP prompts and `skill://` resources are revoked immediately,
because they are checked on every request (see [skills.md](skills.md)). Use the MCP surfaces when
revocation must be instant, and sync when agents need the skill's files on disk (scripts, references) or
work offline.

## CI

Create a service-account token in the dashboard or with
`smartplane tokens create --kind service-account --name ci --ttl 30d`. Grant it what the job needs
(`grants add --to token:ci ...`), store it as a CI secret, and expose it as `SMARTPLANE_TOKEN`. No login
step or credentials file is needed.

```yaml
# GitHub Actions
- name: Verify audit chain and export evidence
  env:
    SMARTPLANE_TOKEN: ${{ secrets.SMARTPLANE_TOKEN }}
  run: |
    npx -y smartplane whoami
    npx -y smartplane audit verify
    npx -y smartplane audit export --from 1d > audit.ndjson
    npx -y smartplane grants ls --json | jq 'map(select(.expiresAt == null)) | length'
```

Service-account tokens act with the `member` role's org permissions. What they can reach comes only from
grants on the token itself. Commands that need admin permissions (`members`, `grants add`) need a personal
token from an admin instead.
