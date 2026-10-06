-- Minimal kaneo_src (production dump) fixture: the six tables STL-18 imports,
-- with fork column shape (kaneo fork schema.ts). Used by the import and
-- reconciliation tests; created inside schema kaneo_src by the harness.
CREATE TABLE kaneo_src."user" (
  id text PRIMARY KEY,
  name text, email text, email_verified boolean,
  image text, locale text, created_at timestamp, updated_at timestamp,
  is_anonymous boolean
);
CREATE TABLE kaneo_src.organization (
  id text PRIMARY KEY, name text, slug text, logo text, metadata text,
  description text, repos_enabled boolean, tables_enabled boolean,
  work_enabled boolean, default_resource_privilege text, ai_enabled boolean,
  ai_default_token_limit integer, ai_default_character_limit integer,
  ai_provider_base_url text, ai_provider_model text, created_at timestamp
);
CREATE TABLE kaneo_src.repo (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES kaneo_src.organization (id),
  provider text NOT NULL, owner text NOT NULL, name text NOT NULL,
  external_id text, url text NOT NULL, description text, default_branch text,
  is_private boolean NOT NULL DEFAULT false, config jsonb,
  is_active boolean NOT NULL DEFAULT true, org_privilege text,
  last_synced_at timestamp, created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE kaneo_src.repo_issue (
  id text PRIMARY KEY, repo_id text NOT NULL REFERENCES kaneo_src.repo (id),
  number integer NOT NULL, external_id text, title text NOT NULL, body text,
  state text NOT NULL, author_login text, author_avatar_url text,
  assignee_logins jsonb, labels jsonb, comment_count integer NOT NULL DEFAULT 0,
  url text NOT NULL, external_created_at timestamp, external_updated_at timestamp,
  closed_at timestamp, created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE kaneo_src.repo_pull_request (
  id text PRIMARY KEY, repo_id text NOT NULL REFERENCES kaneo_src.repo (id),
  number integer NOT NULL, external_id text, title text NOT NULL, body text,
  state text NOT NULL, is_draft boolean NOT NULL DEFAULT false,
  author_login text, author_avatar_url text, head_branch text, base_branch text,
  labels jsonb, comment_count integer NOT NULL DEFAULT 0,
  additions integer, deletions integer, changed_files integer,
  url text NOT NULL, external_created_at timestamp, external_updated_at timestamp,
  merged_at timestamp, closed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE kaneo_src.organization_github_installation (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES kaneo_src.organization (id),
  installation_id integer NOT NULL, account_id integer NOT NULL,
  account_login text NOT NULL, account_type text NOT NULL, account_avatar_url text,
  repository_selection text, permissions jsonb,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE kaneo_src.github_user_grant (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES kaneo_src."user" (id),
  provider_id text NOT NULL, github_user_id text NOT NULL, github_login text NOT NULL,
  access_token text NOT NULL, refresh_token text,
  access_token_expires_at timestamp, refresh_token_expires_at timestamp, scope text,
  created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE kaneo_src.board (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES kaneo_src.organization (id),
  name text NOT NULL, created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE TABLE kaneo_src.integration (
  id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES kaneo_src.board (id),
  type text NOT NULL, config text NOT NULL, is_active boolean,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
