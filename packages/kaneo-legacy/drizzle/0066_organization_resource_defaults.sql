ALTER TABLE "organization"
ADD COLUMN "default_resource_privilege" text NOT NULL DEFAULT 'manage';

ALTER TABLE "organization"
ADD COLUMN "resource_default_overrides" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "organization"
ADD CONSTRAINT "organization_default_resource_privilege_check"
CHECK ("default_resource_privilege" IN ('none', 'view', 'edit', 'manage'));

ALTER TABLE "resource_grant"
DROP CONSTRAINT "resource_grant_resource_type_check";

ALTER TABLE "resource_grant"
ADD CONSTRAINT "resource_grant_resource_type_check"
CHECK ("resource_type" IN ('board', 'repo', 'table'));
