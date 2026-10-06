ALTER TABLE "board" ADD COLUMN "org_privilege" text;
ALTER TABLE "repo" ADD COLUMN "org_privilege" text;
ALTER TABLE "data_table" ADD COLUMN "org_privilege" text;

ALTER TABLE "board"
ADD CONSTRAINT "board_org_privilege_check"
CHECK ("org_privilege" IS NULL OR "org_privilege" IN ('none', 'view', 'edit', 'manage'));

ALTER TABLE "repo"
ADD CONSTRAINT "repo_org_privilege_check"
CHECK ("org_privilege" IS NULL OR "org_privilege" IN ('none', 'view', 'edit', 'manage'));

ALTER TABLE "data_table"
ADD CONSTRAINT "data_table_org_privilege_check"
CHECK ("org_privilege" IS NULL OR "org_privilege" IN ('none', 'view', 'edit', 'manage'));

-- 0066 shipped per-resource-TYPE overrides; the corrected model is per
-- RESOURCE. The column was additive and never exposed beyond one session,
-- so drop it rather than carry dead weight.
ALTER TABLE "organization" DROP COLUMN IF EXISTS "resource_default_overrides";

-- Behaviour preservation: previously, a resource with ANY explicit grant was
-- invisible to members without a matching grant ("adding a grant locks it
-- down"). The new fallback is the resource baseline → org default, which
-- would silently OPEN those resources. Pin them to hidden instead.
UPDATE "board" b SET "org_privilege" = 'none'
WHERE b."org_privilege" IS NULL AND EXISTS (
  SELECT 1 FROM "resource_grant" g
  WHERE g."resource_type" = 'board' AND g."resource_id" = b."id"
);

UPDATE "repo" r SET "org_privilege" = 'none'
WHERE r."org_privilege" IS NULL AND EXISTS (
  SELECT 1 FROM "resource_grant" g
  WHERE g."resource_type" = 'repo' AND g."resource_id" = r."id"
);
