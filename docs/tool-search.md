# Tool search

An org with many MCP servers and integrations can give an agent hundreds of tools. Long tool lists cost
context and make some MCP clients warn or truncate. Above a threshold, the gateway's `tools/list` offers
search instead of every tool.

## What the agent sees

In search mode `tools/list` returns:

- `smartplane__search_tools`: `{ query, server?, limit? }` returns matching tools with their full definitions
  (name, description, input schema, read/write hints). Its description names the caller's servers and how many
  tools each has.
- `smartplane__call_tool`: `{ name, arguments? }` runs a tool by its full name.
- The built-in tools (`skills_list` and the others), which stay listed.

Every real tool stays callable by its own name too, listed or not. `call_tool` unwraps to the real tool before
the pipeline, so grants, guard rules, approvals and the audit log see that tool (the audit entry records
`via: smartplane__call_tool`). An unknown name is refused with the closest names from the caller's own catalog.

Search only ever looks at the caller's own catalog, so it cannot reveal tools they are not granted. Ranking is
deterministic (stems, synonyms, a read/write boost from the query's verb); no model is called.

## When it switches

| Setting | Behaviour |
|---|---|
| Org threshold (default 40) | Search mode when the caller has more tools than this |
| `0` | Always search mode |
| `null` | Never; every tool is listed |
| `x-smartplane-tools: all` header | Lists every tool for this connection, whatever the threshold |
| `x-smartplane-tools: search` header | Search mode for this connection, whatever the threshold |

Admins change the threshold in org settings (`toolSearchThreshold`, 0–1000 or null); changes are audited.
