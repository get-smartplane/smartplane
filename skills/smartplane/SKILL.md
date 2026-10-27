---
name: smartplane
description: Use whenever you call tools through the Smartplane MCP server (names like github__create_issue, skills_list, variables_get), when a tool call is denied, held for approval or not connected, when a task needs an API key, password, token, database URL or other secret or credential, or when asked to set up a service with a Smartplane machine token (pcm_…).
metadata:
  managed-by: smartplane
  built-in: "true"
---

# Working through Smartplane

Smartplane is your organisation's gateway to its tools, skills, variables and secrets. Every call you make
through it is checked against the user's grants and the org's guard rules, and written to an audit log that
people review.

## Finding tools

- Gateway tools are named `<server>__<tool>`: `github__create_issue`, `analytics__query`, `stripe__request`.
  The part before `__` is the resource an admin added; the part after is the operation.
- `skills_list` lists the org's approved skills (reusable instructions); `skills_get` returns one by name.
  Prefer an org skill over improvising when one fits the task.
- `variables_get` reads a non-secret configuration value (a region, a bucket name, a base URL).
- If a tool you need is missing, the user has no access to it. Say what you were looking for; do not guess
  names or call a similar-looking tool instead.

## When a call is refused

Read the refusal text: it says which check refused.

| The result says | What it means | What you do |
| --- | --- | --- |
| `Denied by your access grants` | The user lacks a grant (or the grant does not cover this tool or argument). | Tell the user which access to request (the resource and the operation), then stop. Do not retry, and do not try another tool to get the same effect. |
| `Denied by a guard rule` | An org rule (for example "nobody deletes reports from the Q3 folder") classified this action as a violation, or could not be checked. | Explain which action was refused and that a rule blocked it. Never rephrase, split, or reroute the action to get past the rule. Ask the user how to proceed. |
| `This action needs approval (apr_...)` | A rule requires a person to approve this action. | Tell the user it is waiting for an approver (someone in the org other than the user; nobody approves their own request) and give the approval id. Do not call it again in a loop; retry once, only after the user says it was approved. |
| `Not connected: ... Connect it at <url>` | The account this tool acts as is not connected. | Give the user the link from the message. Retry after they say they connected it. |

## Secrets and credentials

- Never ask the user to paste an API key, password, token or connection string into the chat, and never
  write one into a `.env` file, a config file or source code.
- Gateway tools already carry their credentials: call the tool, not the API with a key.
- To run a local command that needs secrets (dev servers, tests, migrations, scripts), run it under
  `smartplane run -- <command>`, for example `smartplane run -- npm run dev`. The values go into that
  process's environment only. `smartplane run --dry-run` lists which names would be injected, never values.
- `[smartplane:NAME]` in command output is a secret that was masked on purpose. It is not an error and not
  the real value; do not try to recover it.
- Never print, echo, log, base64-encode, hash, split or otherwise reveal a secret value, including in
  commands you write for the user.
- If a name is reported as not delivered (`no grant`, `not deliverable`), tell the user to ask an admin for
  access to that secret; do not work around it.

## Setting up a deployed service

When the user gives you a machine token (`pcm_…`, or says it is in `SMARTPLANE_TOKEN`) and asks you to set
up a service with Smartplane secrets, read [references/deploy.md](references/deploy.md) first (over MCP:
the resource `skill://smartplane/references/deploy.md`). In short: detect the platform from the repository,
store `SMARTPLANE_TOKEN` only in the platform's own secret store (never in a file in the repository), wrap
the start command in `smartplane run --purpose boot -- <cmd>` or call `loadSecrets()`, show the diff, and
verify with `smartplane run --dry-run`, which lists names only.

## Audit

Every call is audited under the user's name. When exploring, prefer read-only tools (list, get, search,
query). Before a destructive or hard-to-undo action (delete, overwrite, send, pay, deploy), say what you are
about to do and wait for the user to confirm.
