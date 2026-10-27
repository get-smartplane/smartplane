-- Why a membership was switched off (the `reason` given to `deprovisionMember`, first one wins). WorkOS
-- webhooks may undo only a removal that WorkOS or SCIM made; a removal in Smartplane (dashboard, access
-- review) stays in force until the member is re-added in WorkOS as a new membership. Rows removed before
-- this column existed have NULL, which counts as a Smartplane removal.
ALTER TABLE memberships ADD COLUMN deprovision_reason TEXT;
