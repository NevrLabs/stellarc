ALTER TABLE "asset" ALTER COLUMN "board_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "repo_id" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset" ADD CONSTRAINT "asset_repo_id_repo_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repo"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_repoId_idx" ON "asset" USING btree ("repo_id");
--> statement-breakpoint
ALTER TABLE "asset" DROP CONSTRAINT IF EXISTS "asset_owner_context_check";
--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_owner_context_check" CHECK ("board_id" IS NOT NULL OR "repo_id" IS NOT NULL);
