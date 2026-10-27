-- Guard approvers and rule-following names.
-- `approvers`: JSON array of {_tag: "Author" | "Role" | "Team" | "User", ...}; empty = anyone with approvals:decide.
-- `name_follows_rule`: 1 while nobody named the guard by hand, so editing the rule renames it.
ALTER TABLE guards ADD COLUMN approvers TEXT NOT NULL DEFAULT '[]';
ALTER TABLE guards ADD COLUMN name_follows_rule INTEGER NOT NULL DEFAULT 0 CHECK (name_follows_rule IN (0, 1));

-- Existing guards whose name is the start of their rule were named from it (the dashboard and CLI derived
-- names client-side); they follow the rule from now on. Hand-typed names stay as they are.
UPDATE guards SET name_follows_rule = 1
 WHERE substr(rule, 1, length(name)) = name
    OR (substr(name, -1) = '…' AND substr(rule, 1, length(name) - 1) = substr(name, 1, length(name) - 1));
