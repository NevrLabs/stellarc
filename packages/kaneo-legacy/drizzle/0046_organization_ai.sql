ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "ai_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "ai_default_token_limit" integer DEFAULT 1024 NOT NULL;
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "ai_default_character_limit" integer DEFAULT 4000 NOT NULL;
--> statement-breakpoint
ALTER TABLE "organization_member" ADD COLUMN IF NOT EXISTS "ai_token_limit" integer;
--> statement-breakpoint
ALTER TABLE "organization_member" ADD COLUMN IF NOT EXISTS "ai_character_limit" integer;
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_ai_token_limit_positive" CHECK ("ai_default_token_limit" > 0);
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_ai_character_limit_positive" CHECK ("ai_default_character_limit" > 0);
--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_ai_token_limit_positive" CHECK ("ai_token_limit" IS NULL OR "ai_token_limit" > 0);
--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_ai_character_limit_positive" CHECK ("ai_character_limit" IS NULL OR "ai_character_limit" > 0);