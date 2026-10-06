CREATE TABLE "task_template" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "task_template_organization_name_unique" UNIQUE("organization_id", "name")
);
--> statement-breakpoint
ALTER TABLE "task_template" ADD CONSTRAINT "task_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "task_template_organization_id_idx" ON "task_template" USING btree ("organization_id");
