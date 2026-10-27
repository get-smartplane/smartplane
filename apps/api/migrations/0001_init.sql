-- primitive-context schema. Column names are the snake_case of the @pc/domain model fields; JSON columns
-- hold the JSON encoding of the matching domain schema and are decoded by the repositories.
-- Timestamps are ISO-8601 UTC strings.

-- Tenants. Mirrors a WorkOS Organization (source of truth for SSO + directory sync).
CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  workos_org_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  audit_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TEXT NOT NULL
);

-- Mirrors WorkOS users (JIT on login). Never hard-deleted so audit events keep resolving.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  workos_user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprovisioned')),
  last_seen_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX users_email ON users (lower(email));

-- Org membership. `user_id` is NULL while an invitation is pending.
CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  user_id TEXT REFERENCES users (id),
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'deprovisioned')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'workos', 'scim')),
  workos_membership_id TEXT,
  created_at TEXT NOT NULL,
  deprovisioned_at TEXT
);
CREATE UNIQUE INDEX memberships_org_user ON memberships (org_id, user_id);
CREATE UNIQUE INDEX memberships_org_email ON memberships (org_id, lower(email));

-- Custom roles. Builtin roles live in code (@pc/domain builtinRolePermissions).
CREATE TABLE roles (
  org_id TEXT NOT NULL REFERENCES orgs (id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, slug)
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  directory_group_id TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX teams_org_slug ON teams (org_id, slug);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  added_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX team_members_user ON team_members (user_id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX projects_org_slug ON projects (org_id, slug);

-- MCP servers, tools, skills, databases, APIs, secrets and variables. `kind` mirrors `config.kind` for indexing.
CREATE TABLE resources (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  project_id TEXT REFERENCES projects (id),
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT
);
CREATE INDEX resources_org_kind ON resources (org_id, kind);
CREATE UNIQUE INDEX resources_org_kind_name ON resources (org_id, kind, name) WHERE deleted_at IS NULL;

-- Envelope-encrypted secret versions: AES-GCM ciphertext under a per-version DEK wrapped by the KEK.
CREATE TABLE secret_versions (
  resource_id TEXT NOT NULL REFERENCES resources (id),
  version INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  wrapped_dek TEXT NOT NULL,
  kek_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (resource_id, version)
);

-- Grants are additive: one action per row; `subject` is the GrantSubject JSON, denormalised into
-- subject_type/subject_id for lookups.
CREATE TABLE grants (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  subject TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'team', 'role', 'service_account')),
  subject_id TEXT NOT NULL,
  resource_id TEXT NOT NULL REFERENCES resources (id),
  action TEXT NOT NULL CHECK (action IN ('read', 'use', 'write', 'admin')),
  conditions TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT
);
CREATE INDEX grants_subject ON grants (org_id, subject_type, subject_id);
CREATE INDEX grants_resource ON grants (resource_id);

CREATE TABLE guards (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  project_id TEXT REFERENCES projects (id),
  resource_ids TEXT NOT NULL DEFAULT '[]',
  name TEXT NOT NULL,
  rule TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('enforce', 'monitor', 'require_approval')),
  threshold REAL NOT NULL CHECK (threshold >= 0 AND threshold <= 1),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'disabled')),
  compiled TEXT,
  compiled_version INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX guards_org_status ON guards (org_id, status);

-- `requested_by_id` is the actor id, kept as a column for the separation-of-duties check. `request_hash`
-- identifies the exact held-back action (resource, tool, arguments) so a retry finds its approval.
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  guard_id TEXT NOT NULL REFERENCES guards (id),
  requested_by TEXT NOT NULL,
  requested_by_id TEXT NOT NULL,
  request TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  decided_by TEXT,
  decided_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX approvals_org_status ON approvals (org_id, status);
CREATE INDEX approvals_request ON approvals (org_id, requested_by_id, request_hash);

-- MCP/API access tokens. Only the SHA-256 of the plaintext is stored. `membership_id` ties personal tokens
-- to the creator's membership so they die with it.
CREATE TABLE access_tokens (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs (id),
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'service_account')),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users (id),
  membership_id TEXT REFERENCES memberships (id),
  project_id TEXT REFERENCES projects (id),
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX access_tokens_org_creator ON access_tokens (org_id, created_by);

-- Append-only, hash-chained audit log, written only by the per-org AuditLog Durable Object.
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target TEXT NOT NULL,
  target_id TEXT,
  data TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  request_id TEXT,
  occurred_at TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE UNIQUE INDEX audit_org_seq ON audit_events (org_id, seq);
CREATE INDEX audit_org_time ON audit_events (org_id, occurred_at);
CREATE INDEX audit_org_type ON audit_events (org_id, type, seq);
CREATE INDEX audit_org_actor ON audit_events (org_id, actor_id, seq);

-- Defence in depth for the append-only invariant; `verify` still detects edits made around these.
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;
