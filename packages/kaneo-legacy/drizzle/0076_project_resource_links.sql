CREATE TABLE IF NOT EXISTS "project_board" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"board_id" text NOT NULL,
	"relationship" text NOT NULL,
	"label" text,
	"note" text,
	"rank" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_board_project_id_board_id_unique" UNIQUE("project_id","board_id"),
	CONSTRAINT "project_board_relationship_check" CHECK ("relationship" in ('context', 'dependency', 'deliverable')),
	CONSTRAINT "project_board_rank_check" CHECK ("rank" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_repo" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"repo_id" text NOT NULL,
	"relationship" text NOT NULL,
	"label" text,
	"note" text,
	"rank" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_repo_project_id_repo_id_unique" UNIQUE("project_id","repo_id"),
	CONSTRAINT "project_repo_relationship_check" CHECK ("relationship" in ('context', 'dependency', 'deliverable')),
	CONSTRAINT "project_repo_rank_check" CHECK ("rank" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_table_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" text NOT NULL,
	"table_id" text NOT NULL,
	"relationship" text NOT NULL,
	"label" text,
	"note" text,
	"rank" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_table_link_project_id_table_id_unique" UNIQUE("project_id","table_id"),
	CONSTRAINT "project_table_link_relationship_check" CHECK ("relationship" in ('context', 'dependency', 'deliverable')),
	CONSTRAINT "project_table_link_rank_check" CHECK ("rank" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "repo" ADD CONSTRAINT "repo_organization_id_id_unique" UNIQUE("organization_id","id");
EXCEPTION
 WHEN duplicate_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_table" ADD CONSTRAINT "data_table_organization_id_id_unique" UNIQUE("organization_id","id");
EXCEPTION
 WHEN duplicate_table OR duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_board" ADD CONSTRAINT "project_board_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_board" ADD CONSTRAINT "project_board_organization_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "project"("organization_id","id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_board" ADD CONSTRAINT "project_board_organization_board_fk" FOREIGN KEY ("organization_id","board_id") REFERENCES "board"("organization_id","id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_board" ADD CONSTRAINT "project_board_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_repo" ADD CONSTRAINT "project_repo_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_repo" ADD CONSTRAINT "project_repo_organization_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "project"("organization_id","id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_repo" ADD CONSTRAINT "project_repo_organization_repo_fk" FOREIGN KEY ("organization_id","repo_id") REFERENCES "repo"("organization_id","id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_repo" ADD CONSTRAINT "project_repo_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_table_link" ADD CONSTRAINT "project_table_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_table_link" ADD CONSTRAINT "project_table_link_organization_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "project"("organization_id","id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_table_link" ADD CONSTRAINT "project_table_link_organization_table_fk" FOREIGN KEY ("organization_id","table_id") REFERENCES "data_table"("organization_id","id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_table_link" ADD CONSTRAINT "project_table_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_board_project_id_idx" ON "project_board" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_board_board_id_idx" ON "project_board" ("board_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_board_project_id_rank_idx" ON "project_board" ("project_id","rank");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_repo_project_id_idx" ON "project_repo" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_repo_repo_id_idx" ON "project_repo" ("repo_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_repo_project_id_rank_idx" ON "project_repo" ("project_id","rank");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_table_link_project_id_idx" ON "project_table_link" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_table_link_table_id_idx" ON "project_table_link" ("table_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_table_link_project_id_rank_idx" ON "project_table_link" ("project_id","rank");
