-- Onboarding progress, kept on the server so it resumes on any device and for any admin of the org.
-- No row means "not started": the API reports the defaults (setup open, welcome pending for non-owners).

-- The admin setup flow: one row per org. `steps` is the JSON encoding of `SetupSteps`.
CREATE TABLE org_setups (
  org_id TEXT PRIMARY KEY REFERENCES orgs (id),
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'dismissed')),
  steps TEXT NOT NULL,
  tool_resource_id TEXT,
  guard_id TEXT,
  updated_by TEXT NOT NULL REFERENCES users (id),
  updated_at TEXT NOT NULL
);

-- An invited member's first-sign-in welcome: one row per member once they finish or dismiss it.
CREATE TABLE member_welcomes (
  org_id TEXT NOT NULL REFERENCES orgs (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'dismissed')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
