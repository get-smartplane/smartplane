-- Machine tokens: credentials for deployed services that fetch deliverable secrets at boot
-- (POST /api/secrets/deliver, and nothing else). They belong to the org, not their creator: offboarding the
-- creator leaves them working, so access reviews list them. Only the SHA-256 of the token is stored.
-- `allow` is the JSON array of secret/variable resource ids the token may receive; it is the token's grant.
CREATE TABLE machine_tokens (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  project_id TEXT REFERENCES projects (id),
  allow TEXT NOT NULL DEFAULT '[]',
  created_by TEXT NOT NULL REFERENCES users (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  last_used_ip TEXT,
  revoked_at TEXT,
  revoked_by TEXT
);
CREATE INDEX machine_tokens_org ON machine_tokens (org_id, created_at);

-- Access review campaigns snapshot the org's live machine tokens (JSON array of ReviewedMachineToken).
ALTER TABLE access_reviews ADD COLUMN machine_tokens TEXT NOT NULL DEFAULT '[]';

-- Secret delivery mode and env names live in resources.config (JSON): `delivery` and `envName` on secrets,
-- `envName` on variables. Rows without them decode as before (gateway_only, derived env name).
