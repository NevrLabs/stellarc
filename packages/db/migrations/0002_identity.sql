CREATE TABLE "user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  locale text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  is_anonymous boolean DEFAULT false,
  role text,
  banned boolean DEFAULT false,
  ban_reason text,
  ban_expires timestamp without time zone
);
CREATE TABLE account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamp without time zone,
  refresh_token_expires_at timestamp without time zone,
  scope text,
  password text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL
);
CREATE INDEX "account_userId_idx" ON account (user_id);
CREATE TABLE organization (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo text,
  metadata text,
  description text,
  repos_enabled boolean NOT NULL DEFAULT false,
  tables_enabled boolean NOT NULL DEFAULT false,
  work_enabled boolean NOT NULL DEFAULT false,
  default_resource_privilege text NOT NULL DEFAULT 'manage',
  ai_enabled boolean NOT NULL DEFAULT false,
  ai_default_token_limit integer NOT NULL DEFAULT 1024,
  ai_default_character_limit integer NOT NULL DEFAULT 4000,
  ai_provider_base_url text,
  ai_provider_model text,
  ai_provider_api_key text,
  created_at timestamp without time zone NOT NULL
);
CREATE UNIQUE INDEX organization_slug_lower_unique ON organization (lower(slug));
CREATE TABLE organization_member (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  ai_token_limit integer,
  ai_character_limit integer,
  joined_at timestamp without time zone NOT NULL
);
CREATE INDEX "organization_member_organizationId_idx" ON organization_member (organization_id);
CREATE INDEX "organization_member_userId_idx" ON organization_member (user_id);
CREATE TABLE organization_role (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role text NOT NULL,
  permission text NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL
);
CREATE INDEX "organization_role_organizationId_idx" ON organization_role (organization_id);
CREATE INDEX "organization_role_role_idx" ON organization_role (role);
CREATE TABLE team (
  id text PRIMARY KEY,
  name text NOT NULL,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'kaneo',
  icon text,
  parent_team_id text REFERENCES team(id) ON DELETE SET NULL,
  created_at timestamp without time zone NOT NULL,
  updated_at timestamp without time zone
);
CREATE INDEX "team_organizationId_idx" ON team (organization_id);
CREATE TABLE team_member (
  id text PRIMARY KEY,
  team_id text NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at timestamp without time zone
);
CREATE INDEX "teamMember_teamId_idx" ON team_member (team_id);
CREATE INDEX "teamMember_userId_idx" ON team_member (user_id);
CREATE TABLE invitation (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text,
  team_id text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamp without time zone NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  inviter_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX "invitation_organizationId_idx" ON invitation (organization_id);
CREATE INDEX "invitation_email_idx" ON invitation (email);
CREATE INDEX "invitation_inviterId_idx" ON invitation (inviter_id);
CREATE TABLE apikey (
  id text PRIMARY KEY,
  config_id text NOT NULL DEFAULT 'default',
  name text,
  start text,
  reference_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  prefix text,
  "key" text NOT NULL,
  user_id text REFERENCES "user"(id) ON DELETE CASCADE,
  refill_interval integer,
  refill_amount integer,
  last_refill_at timestamp without time zone,
  enabled boolean DEFAULT true,
  rate_limit_enabled boolean DEFAULT true,
  rate_limit_time_window integer DEFAULT 86400000,
  rate_limit_max integer DEFAULT 10,
  request_count integer DEFAULT 0,
  remaining integer,
  last_request timestamp without time zone,
  expires_at timestamp without time zone,
  created_at timestamp without time zone NOT NULL,
  updated_at timestamp without time zone NOT NULL,
  permissions text,
  metadata text
);
CREATE INDEX "apikey_configId_idx" ON apikey (config_id);
CREATE INDEX "apikey_key_idx" ON apikey ("key");
CREATE INDEX "apikey_referenceId_idx" ON apikey (reference_id);
CREATE INDEX "apikey_userId_idx" ON apikey (user_id);
CREATE TABLE user_avatar (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mime_type text NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL,
  CONSTRAINT user_avatar_user_id_unique UNIQUE (user_id)
);
CREATE INDEX "user_avatar_userId_idx" ON user_avatar (user_id);
CREATE TABLE session (
  id text PRIMARY KEY,
  expires_at timestamp without time zone NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL,
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  active_organization_id text,
  active_team_id text,
  impersonated_by text
);
CREATE TABLE verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamp without time zone NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL
);
CREATE TABLE principal (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('human', 'agent')),
  user_id text NOT NULL REFERENCES "user"(id),
  apikey_id text UNIQUE REFERENCES apikey(id),
  CHECK ((kind = 'human' AND apikey_id IS NULL) OR (kind = 'agent' AND apikey_id IS NOT NULL))
);
CREATE UNIQUE INDEX "principal_user_id_human_unique" ON principal (user_id) WHERE kind = 'human';
CREATE TABLE identity_grant (
  org_id text NOT NULL REFERENCES organization(id),
  principal_id text NOT NULL REFERENCES principal(id),
  capability text NOT NULL,
  PRIMARY KEY (org_id, principal_id, capability)
);
CREATE TABLE identity_import (
  source_id text NOT NULL,
  table_name text NOT NULL,
  source_pk text NOT NULL,
  digest text NOT NULL,
  PRIMARY KEY (source_id, table_name, source_pk)
);
