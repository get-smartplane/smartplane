# Skills

A **skill** is a resource (`kind: "skill"`) holding reusable instructions your org approves once and every
agent can use: "draft release notes", "fill a PDF form", "review a migration". A skill is either a single
markdown body written in the dashboard (**inline**), or a **bundle**: a folder in the
[Agent Skills](https://agentskills.io) format, with a `SKILL.md` (YAML frontmatter `name`, `description`, ...)
plus scripts, references and assets. Smartplane serves each skill a caller may read in three ways from the one
`/mcp` endpoint:

| MCP surface | What clients do with it |
| --- | --- |
| **Prompt** (`prompts/list`, `prompts/get`) | Shown as a slash command. The client asks for the arguments, then inserts the filled-in instructions. |
| **Resources** (`resources/list`, `resources/read`) | `skill://<slug>` is SKILL.md; `skill://<slug>/<path>` is every other file of a bundle. The CLI (`smartplane skills sync`) writes them to disk. |
| **Tools** `skills_list` / `skills_get` | For clients without prompt or resource support: the agent looks the skill up itself. |

## The built-in `smartplane` skill

Every org is served one skill it did not add: `smartplane`, which teaches agents how to work through the
gateway. It covers finding tools (`<server>__<tool>`, `skills_list`, `skills_get`, `variables_get`), what to
do with each kind of refusal (a missing grant, a guard rule, a call held for approval, an account that is not
connected), secrets (never ask for or write them; `smartplane run -- <cmd>`; `[smartplane:NAME]` is masking,
not an error; never reveal a value), the audit log (prefer read-only tools; announce destructive ones), and
setting up a deployed service with a machine token (`references/deploy.md`: detect the platform, store
`SMARTPLANE_TOKEN` only in the platform's secret store, wrap the start command or call `loadSecrets()`,
verify with `smartplane run --dry-run`).

- **Source.** `apps/api/src/skills/builtin/smartplane/` (`SKILL.md` and `references/deploy.md`), bundled
  into the Worker as text modules (wrangler's `Text` rule for `*.md`). A copy for
  `npx skills add <repo> --skill smartplane` lives at `skills/smartplane/`; a test keeps the two folders
  identical, file for file, and checks that every file in the folder is served.
- **Served everywhere, without a grant.** It is listed and read through every surface org skills use:
  `prompts/list` and `prompts/get`, `resources/list` and `resources/read` (`skill://smartplane` and
  `skill://smartplane/references/deploy.md`, with the same `_meta` plus `"smartplane.dev/builtin": "true"`),
  and `skills_list` (`"builtin": true`) / `skills_get` (which appends the file list).
  Its `smartplane.dev/version` is the content hash of its files as deployed, so `skills sync` rewrites it only
  when a deploy changes it. An org skill whose slug is also `smartplane` keeps its full name through
  `skills_get`; the built-in owns the slug.
- **Audited like other skill reads**: `mcp.prompt_read` and `mcp.resource_read` with no target (it is not a
  resource, like built-in tools) and `"builtin": "smartplane"` in the data.
- **Read-only.** It is not a row, so there is nothing to grant, revoke or rotate. Its synthetic id
  (`res_builtinsmartplane`) is refused by `PATCH` and `DELETE /api/resources/:id` with 403.
  `GET /api/skills/builtin` lists built-in skills (`slug`, `description`, `version`, `builtin: true`) for
  the dashboard to show as "Built-in".
- **Server instructions.** The MCP `initialize` result carries a compact form of the same rules in
  `instructions` (`gatewayInstructions` in `apps/api/src/mcp/sdk.ts`), for clients that read them.

## Sources

| Source | How it is created | New versions |
| --- | --- | --- |
| **inline** | Dashboard **Resources → Add → Skill**, or `POST /api/resources` with `{ kind: "skill", description, body }` | Edit the resource (no version history) |
| **github** | `POST /api/skills` with `source: { type: "github", repo, path?, ref?, tokenSecretId? }`, or `POST /api/resources` with the same fields in a `skill` config | `POST /api/skills/:id/versions` re-fetches the ref |
| **link** | `source: { type: "link", url }`: an HTTPS URL to a `SKILL.md` or to a .zip / .tar.gz | `POST /api/skills/:id/versions` re-fetches |
| **upload** | `POST /api/skills/upload?name=...&projectId=...&description=...` with the archive as the raw body or as the `file` field of a multipart form | `POST /api/skills/:id/versions/upload` |

**GitHub.** `repo` is `owner/repo`; `path` is the skill folder (`skills/pdf`), and a bare name is also tried
as `skills/<name>`, like `npx skills add owner/repo --skill pdf`. Without a path, the repository root is used
when it holds SKILL.md, else the only folder that does; several candidates are refused with their list.
`ref` is a branch, tag or commit (default: the default branch). Every version is pinned to the commit the ref
resolved to (`source.commit`); `GET /api/skills/:id/updates` compares it with the ref's current commit.
`parseGithubSpec` in `@pc/domain` turns the forms people paste (`owner/repo/skills/pdf@main`,
`github:owner/repo`, `https://github.com/owner/repo/tree/main/skills/pdf`) into these fields. Public
repositories are downloaded from codeload; for private ones, store a GitHub token as a `secret` resource and
pass its id as `tokenSecretId` (read server-side only, audited as `secret.accessed`, never sent past a redirect).

**Inline** skills stay exactly as before: one file, `SKILL.md` = the body, served at a content hash of that
one-file bundle. Skills stored before sources existed decode as inline unchanged. A skill's source cannot be
changed by editing it; create a new skill instead.

### Limits and safety

- Archives: .zip, .tar.gz or .tar (detected by content, not name). At most 5 MB compressed, 20 MB expanded,
  500 files and 5 MB per file. A GitHub repository archive may be up to 25 MB / 100 MB while the skill folder
  is picked out of it; the folder itself must then fit the limits above. The repository tarball is never
  expanded in memory: it is gunzipped and parsed as a stream twice, once reading only headers to choose the
  folder and once keeping only that folder's bytes (capped while streaming), so a request holds at most the
  compressed archive plus one skill folder (about 25 + 20 MB) in a Worker's 128 MB.
- Refused: absolute paths, `..` segments, backslashes and control characters in names; symlinks, hard links and
  devices; duplicate paths; encrypted or zip64 zips. Zip entries must inflate to exactly their declared size
  and inflation stops at that size (zip bombs). `__MACOSX/` and `.DS_Store` are dropped.
- Only the executable bit of a file's mode is kept: files are `644` or `755`.
- SKILL.md must exist and be UTF-8. A link must be an archive or a UTF-8 SKILL.md (an HTML page is refused).
- Fetching (links and GitHub): HTTPS on port 443 only, no credentials in URLs, no `localhost`, `*.local`,
  `*.internal`, metadata hosts, IPv6 literals or private/reserved IPv4 literals (including decimal and hex
  spellings). Redirects are followed by hand (at most 3), re-screened, and only to the same host (GitHub:
  also `codeload.github.com`); headers are dropped when the host changes. 20 s timeout, size-capped reads.

## Versions

Every fetch or upload creates an immutable **version**: `version` (1, 2, ...), the `source` snapshot (with the
resolved commit), the file manifest `[{ path, size, sha256, mode }]`, the frontmatter `name` and
`description`, and `contentHash`: sha256 over one `path\tsize\tsha256\tmode\n` line per file in path order,
so equal folders hash equal however they were packed. File contents live in R2 (`SKILLS` bucket
`smartplane-skills`), content-addressed per org at `skills/<orgId>/<sha256>`; the manifest lives in D1
(`skill_versions`, migration 0004). Versions are never edited or deleted (a trigger enforces it) apart from
their scan verdict and override.

A skill's first version becomes active immediately; later versions are served only after
`POST /api/skills/:id/versions/:n/activate`. Agents are always served the active version.

| Endpoint | Permission | |
| --- | --- | --- |
| `POST /api/skills`, `POST /api/skills/upload` | `resources:manage` | Create a skill with its first version |
| `GET /api/skills/:id/versions`, `GET /api/skills/:id/versions/:n` | `resources:read` | List; one version with its scan reports and whether it is servable |
| `POST /api/skills/:id/versions`, `POST /api/skills/:id/versions/upload` | `resources:manage` | Add a version |
| `POST /api/skills/:id/versions/:n/activate` | `resources:manage` | Serve this version (refused if it is not servable) |
| `GET /api/skills/:id/updates` | `resources:manage` | GitHub only: is the ref ahead of the active version's commit? (Uses the org's token; a missing repository, missing ref and a repository the token cannot read give the same error.) |
| `GET /api/skills/:id/bundle` | `read` grant on the skill | The active version as .tar.gz (for the CLI); `x-smartplane-skill-version` carries the content hash |
| `GET /api/skills/scanning` | `resources:read` | Whether scanning is on, which scanners run, the org policy |
| `PUT /api/skills/scanning/policy` | `org:manage` | Set the org's scan policy |
| `POST /api/skills/:id/versions/:n/scan`, `.../override` | `resources:manage` | Re-scan; override (scanning on only) |

## Scanning (experimental)

Scanning is **off by default** and behind the deployment flag `SKILL_SCANNING` (`"off"` | `"on"`, a Worker
var). With it off, no scan runs and nothing is queued, new versions get `scanStatus: "skipped"` and are served,
serving is gated only on `blocked` (a version a scan refused stays refused unless it was overridden, so turning
the flag off for an outage never releases it), re-scan and override answer 409, and
`GET /api/skills/scanning` reports `enabled: false`.

With it on, each new version is `pending` and queued on `skill-scans`; the queue consumer runs every scanner,
stores one report per scanner (`ScanReport { scanner, status, findings, toolVersion, startedAt, finishedAt }`,
findings `{ scanner, ruleId, severity, title, detail, file?, line? }`) and derives the version's status:

- `blocked`: a finding at or above the policy's `blockAt` (default `high`), or a scanner failed it outright;
- `error`: a scanner could not run (Clef unavailable, for example): treated as not scanned, never as passed;
- `flagged`: findings below the threshold; `passed`: nothing above `info`.

**Policy** (per org, `SkillScanPolicy { blockAt, requireScan }`, default `{ "high", true }`): a `blocked`
version is never served; with `requireScan`, `pending`, `error` and `skipped` versions (skipped = created while
scanning was off) are not served either. A version that cannot be served cannot be activated, and if the active
version is not servable the skill disappears from MCP and the bundle endpoint as if it were not granted.

**Override**: `POST /api/skills/:id/versions/:n/override` with `{ "reason": "..." }` (a person with
`resources:manage`) lets a blocked or errored version be served; any other status (a pending scan has no
verdict yet) answers 409. It is audited as `skill.scan_overridden` with the reason and the status it overrode.
A re-scan clears the override (audited as `skill.rescan_requested` with `clearedOverride`), so it never
pre-empts the new verdict. The scan consumer writes only the verdict and reports, and only if the version's
status and override are unchanged since the scan started: an override or re-scan in the meantime wins.

Scanners are pluggable (`SkillScanner` in `apps/api/src/skills/scan/scanner.ts`, wired in `scan/live.ts`):

- **builtin** (in the Worker, milliseconds): line rules for remote scripts piped to a shell, eval/exec of
  downloaded or decoded content, large base64/hex blobs, hidden/bidi/zero-width/tag Unicode, hard-coded
  credentials (AWS, GitHub, OpenAI, Anthropic, Slack, Google keys, private keys), exfiltration (posting
  secrets, env or local files; request bins, tunnels, chat webhooks), `rm -rf ~` or `/`, `chmod 777`, `sudo`
  and network calls in scripts, package installs from URLs, "ignore previous instructions" / system prompt
  extraction, and instructions to bypass permissions or sandboxes. Bundle rules: frontmatter present, `name`
  well-formed and matching its folder, `description` present; compiled executables, nested archives and
  unknown binaries are flagged (images, fonts, PDFs and text are fine).
- **clef** (Workers AI Clef decision model): yes/no questions over SKILL.md and the scripts (prompt injection,
  data exfiltration intent, behaviour that differs from the description, destructive actions without
  confirmation). Probability >= 0.9 is `high`, >= 0.7 `medium`, >= 0.5 `low`. If Clef is unavailable the report
  is `error`.

## Arguments and placeholders

Inline skills declare arguments in their config (below). Bundles may declare the same list as `arguments` in
the SKILL.md frontmatter; prompts render the SKILL.md body (without the frontmatter) with them.

Inline config through the API:

```json
{
  "kind": "skill",
  "description": "Use when drafting customer-facing release notes.",
  "body": "Write release notes for {{version}}. Tone: {{tone}}.\n\n1. Read the merged PRs since the last tag...",
  "arguments": [
    { "name": "version", "description": "Git tag to describe, e.g. v1.4.0", "required": true },
    { "name": "tone", "description": "Voice, e.g. plain or playful" }
  ]
}
```

The slug clients show comes from the resource name: `Release notes` → `release-notes` (lowercase, `-`
between words, cut to 40 characters). The body is markdown, up to 100,000 characters.

An argument `name` starts with a letter or `_`, then uses letters, digits, `_` and `-` (up to 64
characters). A skill can declare up to 20 arguments, and their names must differ.

The body uses `{{name}}` for an argument, with optional inner spaces (`{{ name }}`). When a client asks
for the prompt:

- `{{name}}` is replaced by the value. An optional argument that is not passed becomes an empty string.
- `\{{name}}` produces the literal text `{{name}}`. Use it to show the placeholder syntax itself.
- A `{{placeholder}}` that does not name a declared argument stays exactly as written. Bodies that quote
  Handlebars, Jinja or GitHub Actions syntax are therefore safe, and a skill without arguments renders byte
  for byte as stored.
- Substitution makes a single pass. Values are inserted verbatim and never scanned again, so a value that
  contains `{{other}}` or `$&` stays literal text.
- A missing or blank required argument, an argument the skill does not declare, or a value over 10,000
  characters is refused with JSON-RPC `-32602` (invalid params), and the message names the argument.

Resources take no arguments, so `resources/read` returns the raw file with its placeholders.
`skills_get` returns SKILL.md as stored (for inline skills: exactly the body) plus, for bundles, the list of
the other files as `skill://` URIs. With `arguments`
(`{"name": "release-notes", "arguments": {"version": "v1.4.0"}}`) the body is rendered with the same rules.

## The resources contract (shared with the CLI)

`resources/list` returns, per granted skill with a servable active version, `skill://<slug>` (SKILL.md,
`text/markdown`) followed by `skill://<slug>/<relative/path>` for every other file, each with `size` and:

```json
"_meta": {
  "smartplane.dev/skill": "<slug>",
  "smartplane.dev/path": "<relative path>",
  "smartplane.dev/mode": "644" | "755",
  "smartplane.dev/version": "<contentHash>"
}
```

`resources/read` returns the same `_meta` with `text` for text types (markdown, code, JSON, YAML, ...) that are
UTF-8, and a base64 `blob` otherwise. The MIME type comes from the file name only, so it is the same in both
calls; unknown names are `application/octet-stream`.

## How skills show up in clients

Below, `<server>` is the name the user gave the Smartplane MCP server when adding it to their client
(for example `smartplane`).

- **Claude Code**: the skill appears as the slash command `/mcp__<server>__<slug>`, for example
  `/mcp__smartplane__release-notes v1.4.0 plain`. Arguments are passed by position, in the order they are
  declared. To attach the raw skill, mention the resource: `@smartplane:skill://release-notes`.
- **VS Code (Copilot Chat, agent mode)**: the skill appears as `/mcp.<server>.<slug>`, and VS Code asks for
  each argument. Resources are under **Add Context → MCP Resources**.
- **Cursor**: recent versions list MCP prompts in the chat `/` menu. Older versions only see the
  `skills_list` / `skills_get` tools.
- **Other clients** use whichever of prompts, resources or tools they support. The tools are always offered.

Clients fetch the lists when they connect. The gateway is stateless (one server per HTTP request), so it
does not advertise `listChanged` and does not push change notifications. A newly granted or edited skill
appears the next time the client lists prompts (usually on reconnect, or `/mcp` → reconnect in Claude
Code).

## Who sees which skill

The rules are the same as for `skills_get`:

- The caller needs a live `read` grant (or higher: `use`, `write` and `admin` include `read`) on the skill,
  through their user, team or role.
- Revoked and expired grants do not count.
- A skill in a project is visible only to tokens scoped to that project. Org-wide skills are visible to
  every token.
- A caller whose token is not scoped to a project may send `x-smartplane-project: prj_...` (the CLI does,
  from `--project` or `.smartplane/project.json`) to narrow the session to org-wide resources plus that
  project's, as `projectId` does on the delivery endpoint. It never widens access: a project-scoped token
  that names another project gets 403, a malformed id 400.

A bundle skill is served only at its active version, and (with scanning on) only while that version is
servable under the org's scan policy.

A skill the caller cannot read does not exist for them. It is left out of the lists, and asking for it by
name or URI returns the same "unknown prompt" / "resource not found" error as a name that never existed.

If two readable skills share a slug (for example `Release notes` and `release-notes`), the one with the
lowest id gets the prompt and URI. The other is still reachable by its full name through `skills_get`.
Rename one of them to fix the clash.

## Audit

Every read is written to the hash-chained audit log, the same way the tool pipeline records calls:

| Event | When | Target | Data |
| --- | --- | --- | --- |
| `mcp.prompt_read` | `prompts/get` succeeded | the skill | `prompt`, `arguments`, `version`, `isError: false` |
| `mcp.prompt_read` | `prompts/get` refused the arguments | the skill | `prompt`, `arguments`, `rejected`, `isError: true` |
| `mcp.resource_read` | `resources/read` succeeded | the skill | `uri`, `path`, `version` |
| `policy.denied` | the name or URI matches no readable skill | none | `skill`, `reasons: [{ _tag: "UnknownSkill", name }]` |
| `mcp.tool_called` | `skills_list` / `skills_get` | none (built-in) | tool arguments, as for every tool |
| `skill.downloaded` | `GET /api/skills/:id/bundle` | the skill | `version`, `files` |
| `skill.version_created` | a version was fetched or uploaded | the skill | `versionId`, `version`, `contentHash`, `source`, `commit`, `files`, `scanStatus` |
| `skill.activated` | a version became active (`first: true` for the automatic first one) | the skill | `versionId`, `version`, `contentHash` |
| `skill.scanned` | the scan consumer finished (system actor `skill-scanner`) | the skill | `versionId`, `version`, `status`, `findings`, `maxSeverity`, `scanners` |
| `skill.scan_overridden` | an override | the skill | `versionId`, `version`, `scanStatus`, `reason` |
| `skill.rescan_requested` | `POST /api/skills/:id/versions/:n/scan` | the skill | `versionId`, `version`, `contentHash`, `scanStatus` (before), `clearedOverride` (`by`, `reason`) when one was cleared |
| `skill.policy_updated` | `PUT /api/skills/scanning/policy` | the org | `from`, `to` |

Listing (`prompts/list`, `resources/list`) is not audited. A listing only names skills the caller may
already read, and clients list on every connect. `tools/list` keeps its `mcp.tools_listed` event.

Argument values are recorded just like tool-call arguments. Never ask for secrets through skill arguments:
secrets belong in `secret` resources, which agents never see.

## Why guards do not apply to skill reads

Guards (Clef rules such as "nobody deletes reports from the Q3 folder") classify **actions an agent takes
against a resource**: a tool name plus its arguments, checked before anything runs. A skill read has no
side effect. It returns instructions the org approved (and, with scanning on, that passed its policy) to a caller who already holds `read`. The
`skills_get` built-in has always worked this way (built-ins target no resource, so no guard runs). Prompts
and resources keep that behaviour, so the three ways of reading a skill cannot disagree.

Guards still apply in full to whatever the agent does next with those instructions. Every tool call it
makes goes through the normal pipeline.

## Skills as local folders (`smartplane skills sync`)

The CLI can also copy the skills a person may read into local skill folders: `.claude/skills/<slug>/` for
Claude Code and `.agents/skills/<slug>/` for other agents. It reads them through this same MCP endpoint
(`resources/list` and `resources/read`), so the grants and audit described above apply to every file. A
`.smartplane.json` manifest records which folders Smartplane wrote. Sync updates and removes only those
folders, and never touches skills written by hand or installed by other tools. Details are in
[cli.md](cli.md#skills-on-disk).

**Trade-off.** MCP prompts and `skill://` resources are checked on every request, so revoking a grant takes
effect immediately. Synced folders are copies: a revoked skill stays on disk until the next sync. With
`smartplane connect claude-code --sync-skills`, that sync runs from a `SessionStart` hook when the next
session starts. Prefer the MCP surfaces when revocation must be instant. Use sync when agents need a
skill's scripts and references on disk.
