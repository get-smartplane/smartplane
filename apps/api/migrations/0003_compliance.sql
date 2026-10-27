-- Compliance: audit retention purge checkpoints and periodic user access reviews.

-- One row per purge: every audit event of `org_id` with seq <= `through_seq` was deleted from D1 after its
-- day archive in R2 (`archived_key`) was found with matching seq range and last hash. `through_hash` anchors
-- chain verification of the events that remain. Append-only.
CREATE TABLE audit_purge_checkpoints (
  org_id TEXT NOT NULL,
  through_seq INTEGER NOT NULL,
  through_hash TEXT NOT NULL,
  archived_key TEXT NOT NULL,
  purged_at TEXT NOT NULL,
  PRIMARY KEY (org_id, through_seq)
);

CREATE TRIGGER audit_purge_checkpoints_no_update BEFORE UPDATE ON audit_purge_checkpoints
BEGIN
  SELECT RAISE(ABORT, 'audit_purge_checkpoints is append-only');
END;
CREATE TRIGGER audit_purge_checkpoints_no_delete BEFORE DELETE ON audit_purge_checkpoints
BEGIN
  SELECT RAISE(ABORT, 'audit_purge_checkpoints is append-only');
END;

-- A checkpoint must name a stored event by seq and hash, and only move forward.
CREATE TRIGGER audit_purge_checkpoints_valid BEFORE INSERT ON audit_purge_checkpoints
WHEN NOT EXISTS (
       SELECT 1 FROM audit_events e WHERE e.org_id = NEW.org_id AND e.seq = NEW.through_seq AND e.hash = NEW.through_hash
     )
  OR NEW.through_seq <= COALESCE((SELECT MAX(c.through_seq) FROM audit_purge_checkpoints c WHERE c.org_id = NEW.org_id), 0)
BEGIN
  SELECT RAISE(ABORT, 'a purge checkpoint must name a stored event and move forward');
END;

-- Replaces the blanket ban from 0001: only rows covered by a recorded checkpoint may be deleted.
DROP TRIGGER audit_events_no_delete;
CREATE TRIGGER audit_events_purge_only BEFORE DELETE ON audit_events
WHEN NOT EXISTS (
  SELECT 1 FROM audit_purge_checkpoints c WHERE c.org_id = OLD.org_id AND c.through_seq >= OLD.seq
)
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only outside a recorded purge checkpoint');
END;

-- Access review campaigns (SOC 2 CC6). `scope` is the AccessReviewScope JSON.
CREATE TABLE access_reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  due_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_by TEXT,
  closed_at TEXT
);
CREATE INDEX access_reviews_org ON access_reviews (org_id, created_at);

-- Snapshot items: `access` is the ReviewedAccess JSON, `beneficiaries` the JSON array of user ids who hold it.
CREATE TABLE access_review_items (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES access_reviews (id),
  access TEXT NOT NULL,
  beneficiaries TEXT NOT NULL DEFAULT '[]',
  decision TEXT CHECK (decision IN ('keep', 'revoke')),
  decided_by TEXT,
  decided_at TEXT,
  comment TEXT,
  applied_at TEXT
);
CREATE INDEX access_review_items_review ON access_review_items (review_id);

-- Evidence integrity: the snapshot never changes, a decision is final (only `applied_at` may be set, once),
-- a closed review is frozen, and nothing is deleted.
CREATE TRIGGER access_review_items_final BEFORE UPDATE ON access_review_items
WHEN NEW.id IS NOT OLD.id OR NEW.review_id IS NOT OLD.review_id
  OR NEW.access IS NOT OLD.access OR NEW.beneficiaries IS NOT OLD.beneficiaries
  OR (OLD.decision IS NOT NULL AND (NEW.decision IS NOT OLD.decision OR NEW.decided_by IS NOT OLD.decided_by
      OR NEW.decided_at IS NOT OLD.decided_at OR NEW.comment IS NOT OLD.comment))
  OR (OLD.applied_at IS NOT NULL AND NEW.applied_at IS NOT OLD.applied_at)
  OR (SELECT r.status FROM access_reviews r WHERE r.id = OLD.review_id) = 'closed'
BEGIN
  SELECT RAISE(ABORT, 'access review decisions are final');
END;
CREATE TRIGGER access_review_items_no_delete BEFORE DELETE ON access_review_items
BEGIN
  SELECT RAISE(ABORT, 'access review items are evidence and cannot be deleted');
END;
CREATE TRIGGER access_reviews_closed_final BEFORE UPDATE ON access_reviews
WHEN OLD.status = 'closed'
BEGIN
  SELECT RAISE(ABORT, 'a closed access review is final');
END;
CREATE TRIGGER access_reviews_no_delete BEFORE DELETE ON access_reviews
BEGIN
  SELECT RAISE(ABORT, 'access reviews are evidence and cannot be deleted');
END;
