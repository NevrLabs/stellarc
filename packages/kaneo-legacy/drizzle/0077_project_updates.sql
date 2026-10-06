CREATE TABLE IF NOT EXISTS "project_update" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"health" text NOT NULL,
	"edit_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_update" ADD CONSTRAINT "project_update_health_check" CHECK ("health" in ('on-track', 'at-risk', 'off-track'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_update" ADD CONSTRAINT "project_update_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_update" ADD CONSTRAINT "project_update_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_update" ADD CONSTRAINT "project_update_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_update_project_created_at_idx" ON "project_update" ("project_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_update_author_id_idx" ON "project_update" ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_update_organization_id_idx" ON "project_update" ("organization_id");
