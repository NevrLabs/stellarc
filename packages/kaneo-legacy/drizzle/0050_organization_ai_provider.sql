ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "ai_provider_base_url" text;
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "ai_provider_model" text;
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "ai_provider_api_key" text;
