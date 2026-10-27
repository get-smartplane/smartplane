-- Accounts connected to credentialed resources (MCP servers, APIs, integrations). One shared connection per
-- resource (user_id NULL) or one per member (mode 'per_user'). The credential (OAuth token set or a pasted
-- token) is envelope-encrypted in the same format as secret_versions: AES-256-GCM under a per-row data key
-- wrapped by the KEK. A shared integration whose tokens live in its managed secret resource keeps only its
-- metadata here (NULL envelope). Rows are deleted on disconnect, resource deletion and offboarding.
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  resource_id TEXT NOT NULL REFERENCES resources (id),
  user_id TEXT REFERENCES users (id),
  mode TEXT NOT NULL CHECK (mode IN ('shared', 'per_user')),
  method TEXT NOT NULL CHECK (method IN ('oauth', 'secret')),
  status TEXT NOT NULL CHECK (status IN ('connected', 'needs_reauth')),
  account_identity TEXT,
  connected_by TEXT NOT NULL REFERENCES users (id),
  connected_at TEXT NOT NULL,
  refreshed_at TEXT,
  -- Bumped on every credential write; refreshes compare-and-swap on it so concurrent refreshes cannot clobber.
  version INTEGER NOT NULL DEFAULT 1,
  ciphertext TEXT,
  iv TEXT,
  wrapped_dek TEXT,
  kek_id TEXT,
  CHECK ((mode = 'shared') = (user_id IS NULL)),
  CHECK ((ciphertext IS NULL) = (kek_id IS NULL))
);
CREATE UNIQUE INDEX connections_resource_owner ON connections (resource_id, COALESCE(user_id, ''));
CREATE INDEX connections_org_user ON connections (org_id, user_id);
CREATE INDEX connections_kek ON connections (kek_id);
