-- Single-use approvals: an approved request allows exactly one call. The call that uses it moves it
-- `approved` -> `consumed` with a conditional UPDATE, so two concurrent identical calls cannot share one
-- approval. SQLite cannot alter a CHECK constraint, so the table is rebuilt with the new status allowed.
-- Nothing references `approvals`, so the rebuild touches no foreign keys.
CREATE TABLE approvals_new (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  guard_id TEXT NOT NULL REFERENCES guards (id),
  requested_by TEXT NOT NULL,
  requested_by_id TEXT NOT NULL,
  request TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'consumed')),
  decided_by TEXT,
  decided_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
INSERT INTO approvals_new (id, org_id, guard_id, requested_by, requested_by_id, request, request_hash, status, decided_by, decided_at, comment, created_at, expires_at)
  SELECT id, org_id, guard_id, requested_by, requested_by_id, request, request_hash, status, decided_by, decided_at, comment, created_at, expires_at FROM approvals;
DROP TABLE approvals;
ALTER TABLE approvals_new RENAME TO approvals;
CREATE INDEX approvals_org_status ON approvals (org_id, status);
CREATE INDEX approvals_request ON approvals (org_id, requested_by_id, request_hash);
