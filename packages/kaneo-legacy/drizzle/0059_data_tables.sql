CREATE TABLE "data_table" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "icon" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_table_field" (
  "id" text PRIMARY KEY NOT NULL,
  "table_id" text NOT NULL,
  "name" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "type" text DEFAULT 'text' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "data_table_field_type_check" CHECK ("data_table_field"."type" = 'text')
);
--> statement-breakpoint
CREATE TABLE "data_table_row" (
  "id" text PRIMARY KEY NOT NULL,
  "table_id" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_table_cell" (
  "row_id" text NOT NULL,
  "field_id" text NOT NULL,
  "value" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "data_table_cell_row_field_unique" UNIQUE("row_id", "field_id")
);
--> statement-breakpoint
ALTER TABLE "data_table" ADD CONSTRAINT "data_table_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_table_field" ADD CONSTRAINT "data_table_field_table_id_data_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."data_table"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_table_row" ADD CONSTRAINT "data_table_row_table_id_data_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."data_table"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_table_cell" ADD CONSTRAINT "data_table_cell_row_id_data_table_row_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."data_table_row"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_table_cell" ADD CONSTRAINT "data_table_cell_field_id_data_table_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."data_table_field"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "data_table_organization_idx" ON "data_table" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "data_table_field_table_position_idx" ON "data_table_field" USING btree ("table_id", "position");
--> statement-breakpoint
CREATE INDEX "data_table_row_table_position_idx" ON "data_table_row" USING btree ("table_id", "position");
--> statement-breakpoint
CREATE INDEX "data_table_cell_field_idx" ON "data_table_cell" USING btree ("field_id");
