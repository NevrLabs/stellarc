CREATE TABLE "github_user_grant" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "provider_id" text NOT NULL,
  "github_user_id" text NOT NULL,
  "github_login" text NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "github_user_grant_user_provider_unique" UNIQUE("user_id", "provider_id")
);
CREATE INDEX "github_user_grant_user_idx" ON "github_user_grant" ("user_id");

CREATE TABLE "github_delegation_state" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "session_id" text NOT NULL REFERENCES "session"("id") ON DELETE cascade,
  "state_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX "github_delegation_state_expires_idx" ON "github_delegation_state" ("expires_at");
