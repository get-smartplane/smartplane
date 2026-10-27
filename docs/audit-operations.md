# Audit log operations

How an audit event reaches the hash chain, what happens when a step fails, and what to watch in production.

## Delivery path

1. A service calls `AuditLog.write` / `record`. `data` is bounded first: a string over 8 KiB, and then the largest
   top-level values until `data` is under 48 KiB, are replaced by
   `{ "omitted": "oversized", "sha256": "…", "bytes": n, "preview"?: "…" }`. A queue message always stays far below
   the 128 KB Cloudflare Queues limit.
2. The event goes to the `audit-events` queue (3 retries, 50 ms exponential). If the queue keeps failing, it is
   appended straight to the org's `AuditLog` Durable Object (same retries). Only if both fail does the caller see
   `AuditUnavailable` (503), and the whole event is logged at error level as `audit.undeliverable`.
3. The queue consumer groups messages by org and calls `AuditLog.append` on that org's Durable Object. A failed
   group is retried with exponential backoff (5 s doubling, capped at 30 min) up to `max_retries: 100`, which
   covers about two days of D1 or Durable Object trouble.
4. The Durable Object chains the batch in memory and writes it in one atomic D1 batch. Migration 0019 makes D1
   refuse any insert that does not extend the stored head, so a racing or stale writer fails its whole batch and is
   retried; the chain stays gap-free.

Append is idempotent on event id: ids already stored are skipped, duplicates inside a batch keep the first.

## Event types

| Type | When |
|---|---|
| `mcp.tool_call_started` | Before a gateway tool call reaches the upstream, with the (bounded) arguments. If it cannot be recorded, the call is refused with an error and never runs. |
| `mcp.tool_called` | The outcome (`ms`, `isError` or `error`), with `startedEventId` naming the intent event. If only this one cannot be recorded, the agent still gets the real result, so it does not repeat a side effect. |

Changes are audited before they commit (offboarding, approval expiry) or directly after the commit and before any
later step that could fail (resources, KEK re-wrap). Approval expiry uses an event id derived from the approval, so
re-recording it after a partial failure is a no-op.

## Dead-letter queue and replay

A message that exhausts its retries on `audit-events` moves to `audit-events-dlq`. Its consumer:

- logs every message at error level with `alert: "audit.dlq_message"` (message id, attempts, event id, org, type);
- re-delivers it to `AuditLog.append`, acking on success and retrying with the same backoff otherwise;
- acks a message that does not decode as an audit event, after logging its raw body (it would never succeed).

Alert on any `audit.dlq_message`, `audit.undeliverable` or `audit.archive_repair` log line (Workers Logs or the
OTLP log export). Replay needs no manual step: once D1 and the Durable Object are healthy, the DLQ consumer drains
itself. To replay an `audit.undeliverable` event by hand, send its logged `event` JSON to `audit-events`
(`wrangler queues` or a one-off Worker); its id makes the replay idempotent. Replay only works while the original
id is still in D1, that is, within the org's retention.

After a long outage, check that the chain still verifies: `GET /api/audit/verify` or `npx smartplane audit verify`.

## Nightly cron

Each step (archive, purge, KEK re-wrap, approval expiry) and each org runs isolated: a failure is logged as
`cron step failed` / `audit archive failed` and the rest of the night continues.

- **Archive**: per org, every complete UTC day after the `audit_archive_cursors` cursor, up to 31 days a night, is
  streamed to R2 in 500-event pages (one put, or an 8 MiB-part multipart upload for a busy day). The cursor only
  moves past a day once it is in R2, so a missed night is caught up later.
- **Purge**: before purging, a day whose R2 archive is missing or lacks late events is re-archived from D1. A day
  that was partly purged already cannot be rewritten safely: it is logged as `audit.archive_repair` for a manual
  export, and purge stops before it.
