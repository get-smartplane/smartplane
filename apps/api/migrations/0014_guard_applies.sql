-- The calls a guard is checked on (`GuardApplies`), as an admin accepted it from verify's suggestion:
-- {resourceIds, tools?, operations?, actors?}. NULL: every call in the guard's resource scope (the behaviour
-- before this column, and the default until someone accepts a filter).
ALTER TABLE guards ADD COLUMN applies TEXT;
-- A rule added without choosing a mode (quick add): verify sets the mode its wording suggests while it is a draft.
ALTER TABLE guards ADD COLUMN mode_follows_rule INTEGER NOT NULL DEFAULT 0 CHECK (mode_follows_rule IN (0, 1));
