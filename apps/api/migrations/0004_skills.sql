-- Skill bundles: immutable versions of a skill folder (files in R2, manifest here), their scan reports,
-- the active version per skill, and each org's scan policy.

-- `source` is the SkillSourceSnapshot JSON (incl. the resolved commit for GitHub), `files` the SkillFile
-- manifest JSON, `scan_summary` the ScanSummary JSON, `override` the ScanOverride JSON when set.
-- Only the scan verdict and the override change after insert.
CREATE TABLE skill_versions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  resource_id TEXT NOT NULL REFERENCES resources (id),
  version INTEGER NOT NULL CHECK (version >= 1),
  source TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  files TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  scan_status TEXT NOT NULL CHECK (scan_status IN ('pending', 'passed', 'flagged', 'blocked', 'error', 'skipped')),
  scan_summary TEXT NOT NULL,
  override TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (resource_id, version)
);
CREATE INDEX skill_versions_org ON skill_versions (org_id, resource_id);

CREATE TRIGGER skill_versions_immutable BEFORE UPDATE ON skill_versions
WHEN NEW.id IS NOT OLD.id OR NEW.org_id IS NOT OLD.org_id OR NEW.resource_id IS NOT OLD.resource_id
  OR NEW.version IS NOT OLD.version OR NEW.source IS NOT OLD.source OR NEW.content_hash IS NOT OLD.content_hash
  OR NEW.files IS NOT OLD.files OR NEW.created_by IS NOT OLD.created_by OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'skill versions are immutable apart from their scan verdict');
END;
CREATE TRIGGER skill_versions_no_delete BEFORE DELETE ON skill_versions
BEGIN
  SELECT RAISE(ABORT, 'skill versions are never deleted');
END;

-- The latest report of each scanner for a version (ScanReport JSON); a re-scan replaces it.
CREATE TABLE skill_scan_reports (
  version_id TEXT NOT NULL REFERENCES skill_versions (id),
  scanner TEXT NOT NULL,
  report TEXT NOT NULL,
  PRIMARY KEY (version_id, scanner)
);

-- Which version agents are served, one row per bundle skill.
CREATE TABLE skill_active_versions (
  resource_id TEXT PRIMARY KEY REFERENCES resources (id),
  org_id TEXT NOT NULL REFERENCES orgs (id),
  version_id TEXT NOT NULL REFERENCES skill_versions (id),
  activated_by TEXT NOT NULL,
  activated_at TEXT NOT NULL
);
CREATE INDEX skill_active_versions_org ON skill_active_versions (org_id);

-- SkillScanPolicy JSON per org; absent means the default (block at high, require a scan).
CREATE TABLE skill_scan_policies (
  org_id TEXT PRIMARY KEY REFERENCES orgs (id),
  policy TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
