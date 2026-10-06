DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "board"
    GROUP BY "organization_id", lower("slug")
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enable ticket identity aliases: duplicate case-insensitive board keys exist within an organization';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_lower_unique"
  ON "organization" (lower("slug"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_organization_key_lower_unique"
  ON "board" ("organization_id", lower("slug"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_slug_alias" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "slug" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "organization_slug_alias_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_alias_lower_unique"
  ON "organization_slug_alias" (lower("slug"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_slug_alias_organization_id_idx"
  ON "organization_slug_alias" ("organization_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "board_key_alias" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "board_id" text NOT NULL,
  "key" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "board_key_alias_organization_id_organization_id_fk"
    FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
    ON DELETE cascade ON UPDATE cascade,
  CONSTRAINT "board_key_alias_board_id_board_id_fk"
    FOREIGN KEY ("board_id") REFERENCES "public"."board"("id")
    ON DELETE cascade ON UPDATE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "board_key_alias_organization_key_lower_unique"
  ON "board_key_alias" ("organization_id", lower("key"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "board_key_alias_board_id_idx"
  ON "board_key_alias" ("board_id");
