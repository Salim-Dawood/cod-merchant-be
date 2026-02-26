-- Removes database objects/data related to the deprecated client feature.
-- Run this manually against an existing database.

START TRANSACTION;

-- Remove client password reset tokens before tightening enum values.
DELETE FROM password_reset_tokens
WHERE actor_type = 'client';

-- Remove client-related platform role permission links first, then permissions.
DELETE prp
FROM platform_role_permissions prp
INNER JOIN platform_permissions pp ON pp.id = prp.platform_permission_id
WHERE pp.key_name LIKE '%platform-client%';

-- Safe-update friendly delete for MySQL Workbench.
DELETE FROM platform_permissions
WHERE id IN (
  SELECT id FROM (
    SELECT id
    FROM platform_permissions
    WHERE key_name LIKE '%platform-client%'
  ) AS x
);

COMMIT;

-- Drop client feature tables (order matters because of foreign keys).
DROP TABLE IF EXISTS client_orders;
DROP TABLE IF EXISTS platform_clients;
DROP TABLE IF EXISTS platform_client_roles;

-- Tighten password reset actor enum after client rows are removed.
ALTER TABLE password_reset_tokens
  MODIFY COLUMN actor_type ENUM('platform','merchant','buyer') NOT NULL;
