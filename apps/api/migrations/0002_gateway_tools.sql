-- Gateway tools for database resources reach engines by connection string over TCP. D1 and SQLite are
-- not reachable that way, so those engines left the contract: retire any such resources (soft delete,
-- like ResourcesRepo.remove) and revoke their grants, so every live row still decodes.
UPDATE grants
   SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), revoked_by = 'system:migration-0002'
 WHERE revoked_at IS NULL
   AND resource_id IN (
     SELECT id FROM resources
      WHERE kind = 'database' AND deleted_at IS NULL AND json_extract(config, '$.engine') IN ('sqlite', 'd1')
   );

UPDATE resources
   SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
 WHERE kind = 'database' AND deleted_at IS NULL AND json_extract(config, '$.engine') IN ('sqlite', 'd1');
