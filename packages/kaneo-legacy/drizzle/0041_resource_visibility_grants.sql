CREATE TABLE "resource_grant" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "user_id" text,
  "team_id" text,
  "privilege" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "resource_grant_resource_type_check" CHECK ("resource_type" in ('board', 'repo')),
  CONSTRAINT "resource_grant_privilege_check" CHECK ("privilege" in ('view', 'edit', 'manage')),
  CONSTRAINT "resource_grant_single_principal_check" CHECK (num_nonnulls("user_id", "team_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "resource_grant" ADD CONSTRAINT "resource_grant_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resource_grant" ADD CONSTRAINT "resource_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resource_grant" ADD CONSTRAINT "resource_grant_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "resource_grant_resource_idx" ON "resource_grant" USING btree ("organization_id", "resource_type", "resource_id");
--> statement-breakpoint
CREATE INDEX "resource_grant_user_idx" ON "resource_grant" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "resource_grant_team_idx" ON "resource_grant" USING btree ("team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "resource_grant_user_unique" ON "resource_grant" USING btree ("organization_id", "resource_type", "resource_id", "user_id") WHERE "user_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "resource_grant_team_unique" ON "resource_grant" USING btree ("organization_id", "resource_type", "resource_id", "team_id") WHERE "team_id" is not null;
