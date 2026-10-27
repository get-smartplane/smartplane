-- Access set up with an invitation (teams to join, grants to receive), held until the invitation is
-- accepted. Invited memberships have no user yet, so team memberships and user grants cannot exist before
-- then. Accepting applies and deletes the row in one batch; offboarding the invitation deletes it.
CREATE TABLE invitation_access (
  membership_id TEXT PRIMARY KEY REFERENCES memberships (id),
  org_id TEXT NOT NULL REFERENCES orgs (id),
  -- JSON `InviteAccess`: { teamIds, grants: [{ resourceId, action, conditions, expiresAt }] }
  access TEXT NOT NULL,
  -- Who authorized it; recorded as the creator of the grants it becomes.
  set_by TEXT NOT NULL REFERENCES users (id),
  updated_at TEXT NOT NULL
);
CREATE INDEX invitation_access_org ON invitation_access (org_id);
