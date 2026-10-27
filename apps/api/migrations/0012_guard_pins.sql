-- Things inside integrations a rule names, confirmed by an admin (`GuardPin`): JSON array of
-- {id, resourceId, entityId, label, kind, url?, pinnedBy, pinnedAt, missing?, checkedAt?}. Ids and labels only.
ALTER TABLE guards ADD COLUMN pins TEXT NOT NULL DEFAULT '[]';
