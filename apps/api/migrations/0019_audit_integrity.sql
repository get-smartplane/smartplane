-- Audit-log integrity (review batch 2).

-- Every insert must extend its org's chain: seq 1 links to the genesis hash, any later seq to the stored event
-- (or purge checkpoint) right before it. With the unique (org_id, seq) index this makes a stale or racing
-- writer fail its whole batch instead of leaving a gap or a fork; the AuditLog Durable Object then retries.
CREATE TRIGGER audit_events_extend_chain BEFORE INSERT ON audit_events
WHEN NOT (
  (NEW.seq = 1 AND NEW.prev_hash = '0000000000000000000000000000000000000000000000000000000000000000')
  OR EXISTS (SELECT 1 FROM audit_events e WHERE e.org_id = NEW.org_id AND e.seq = NEW.seq - 1 AND e.hash = NEW.prev_hash)
  OR EXISTS (
    SELECT 1 FROM audit_purge_checkpoints c
     WHERE c.org_id = NEW.org_id AND c.through_seq = NEW.seq - 1 AND c.through_hash = NEW.prev_hash
  )
)
BEGIN
  SELECT RAISE(ABORT, 'audit_events insert does not extend the chain');
END;

-- The nightly archiver resumes after `through_day` (YYYY-MM-DD, UTC), so a missed night is caught up later.
CREATE TABLE audit_archive_cursors (
  org_id TEXT PRIMARY KEY,
  through_day TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
