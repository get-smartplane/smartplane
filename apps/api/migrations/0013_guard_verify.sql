-- The latest verify run of a rule (`GuardVerifyRun`): {runId, stage, startedAt, updatedAt, timeline, error?}.
-- Background stages write it only while it still names their run, so a stale run never overwrites a newer one.
ALTER TABLE guards ADD COLUMN verify TEXT;
