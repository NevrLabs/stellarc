import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Canon reconciliation corpus + fixture definitions.
 *
 * canon.ts is the single source of truth for (a) the fork-algorithm API-key hash,
 * (b) the synthetic legacy/destination fixture schemas and seed data, and
 * (c) the canon corpus loader/validator used by both the harness and the tests.
 */

// --- fork verify-api-key.ts @2504e645: unpadded base64url of SHA256(raw) ---------
export function hashApiKey(raw: string): string {
	return createHash("sha256")
		.update(raw)
		.digest("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

export function isValidApiKeyHash(value: string): boolean {
	return /^[A-Za-z0-9_-]{43}$/.test(value);
}

// --- known-answer raws (must match tests/fixtures/reconciliation/manifest.json) --
export const KNOWN_ANSWER_RAWS = [
	"stl27-known-answer-key-1",
	"stl27-known-answer-key-2",
] as const;

// --- legacy (fork) source schema, in schema `legacy` ------------------------------
export const LEGACY_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS legacy;

CREATE TABLE legacy."user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false, image text, locale text,
  created_at timestamp, updated_at timestamp, is_anonymous boolean, role text,
  banned boolean, ban_reason text, ban_expires timestamp
);
CREATE TABLE legacy.account (
  id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
  user_id text NOT NULL, access_token text, refresh_token text, id_token text,
  access_token_expires_at timestamp, refresh_token_expires_at timestamp,
  scope text, password text, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.organization (
  id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL, logo text,
  metadata text, description text, repos_enabled boolean NOT NULL DEFAULT false,
  tables_enabled boolean NOT NULL DEFAULT false,
  default_resource_privilege text NOT NULL DEFAULT 'manage',
  ai_enabled boolean NOT NULL DEFAULT false, ai_default_token_limit integer NOT NULL DEFAULT 1024,
  ai_default_character_limit integer NOT NULL DEFAULT 4000,
  ai_provider_base_url text, ai_provider_model text, ai_provider_api_key text,
  created_at timestamp
);
CREATE TABLE legacy.organization_member (
  id text PRIMARY KEY, organization_id text NOT NULL, user_id text NOT NULL,
  role text NOT NULL DEFAULT 'member', ai_token_limit integer,
  ai_character_limit integer, joined_at timestamp
);
CREATE TABLE legacy.organization_role (
  id text PRIMARY KEY, organization_id text NOT NULL, role text NOT NULL,
  permission text NOT NULL, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.team (
  id text PRIMARY KEY, name text NOT NULL, organization_id text NOT NULL,
  source text NOT NULL DEFAULT 'kaneo', icon text, parent_team_id text,
  created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.team_member (
  id text PRIMARY KEY, team_id text NOT NULL, user_id text NOT NULL, created_at timestamp
);
CREATE TABLE legacy.invitation (
  id text PRIMARY KEY, organization_id text NOT NULL, email text NOT NULL,
  role text, team_id text, status text NOT NULL DEFAULT 'pending',
  expires_at timestamp, created_at timestamp, inviter_id text NOT NULL
);
CREATE TABLE legacy.user_avatar (
  id text PRIMARY KEY, user_id text NOT NULL, mime_type text NOT NULL,
  size integer NOT NULL, data bytea NOT NULL, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.apikey (
  id text PRIMARY KEY, config_id text NOT NULL DEFAULT 'default', name text,
  start text, reference_id text NOT NULL, prefix text, key text NOT NULL,
  user_id text, refill_interval integer, refill_amount integer,
  last_refill_at timestamp, enabled boolean DEFAULT true,
  rate_limit_enabled boolean DEFAULT true, rate_limit_time_window integer DEFAULT 86400000,
  rate_limit_max integer DEFAULT 10, request_count integer DEFAULT 0, remaining integer,
  last_request timestamp, expires_at timestamp, created_at timestamp, updated_at timestamp,
  permissions text, metadata text
);
CREATE TABLE legacy.board (
  id text PRIMARY KEY, organization_id text NOT NULL, slug text NOT NULL,
  icon text DEFAULT 'Layout', name text NOT NULL, description text,
  created_at timestamp, is_public boolean DEFAULT false, archived_at timestamp,
  last_task_number integer NOT NULL DEFAULT 0, org_privilege text,
  task_status_order jsonb NOT NULL DEFAULT '["to-do","in-progress","in-review","done","canceled","duplicate"]',
  backlog_status_order jsonb NOT NULL DEFAULT '["triage","planned"]',
  subtask_depth_limit integer NOT NULL DEFAULT 4,
  default_assignee_id text, default_assignee_team_id text
);
CREATE TABLE legacy.board_key_alias (
  id text PRIMARY KEY, organization_id text NOT NULL, board_id text NOT NULL,
  key text NOT NULL, created_at timestamp
);
CREATE TABLE legacy.column (
  id text PRIMARY KEY, board_id text NOT NULL, name text NOT NULL, slug text NOT NULL,
  position integer NOT NULL DEFAULT 0, icon text, color text,
  is_final boolean NOT NULL DEFAULT false, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.task (
  id text PRIMARY KEY, board_id text NOT NULL, position integer, number integer DEFAULT 1,
  assignee_id text, team_assignee_id text, title text NOT NULL, description text,
  description_history jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'to-do',
  column_id text, priority text DEFAULT 'low', milestone_id text,
  archived_at timestamp, archived_by text, deleted_at timestamp, deleted_by text,
  start_date timestamp, due_date timestamp, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.task_relation (
  id text PRIMARY KEY, source_task_id text NOT NULL, target_task_id text NOT NULL,
  relation_type text NOT NULL, created_at timestamp
);
CREATE TABLE legacy.task_follower (
  id text PRIMARY KEY, task_id text NOT NULL, user_id text NOT NULL, created_at timestamp
);
CREATE TABLE legacy.external_link (
  id text PRIMARY KEY, task_id text NOT NULL, integration_id text,
  resource_type text NOT NULL, external_id text NOT NULL, url text NOT NULL,
  title text, metadata text, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.task_repo_item_link (
  id text PRIMARY KEY, task_id text NOT NULL, repo_issue_id text, repo_pull_request_id text,
  sync_enabled boolean NOT NULL DEFAULT false, sync_broken_at timestamp,
  sync_broken_reason text, created_at timestamp
);
CREATE TABLE legacy.milestone (
  id text PRIMARY KEY, board_id text NOT NULL, name text NOT NULL, description text,
  due_date timestamp, status text NOT NULL DEFAULT 'planned', position integer NOT NULL DEFAULT 0,
  completed_at timestamp, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.activity (
  id text PRIMARY KEY, task_id text NOT NULL, type text NOT NULL,
  created_at timestamp, updated_at timestamp, user_id text, content text,
  edit_history jsonb NOT NULL DEFAULT '[]', event_data jsonb,
  external_user_name text, external_user_avatar text, external_source text, external_url text
);
CREATE TABLE legacy.comment (
  id text PRIMARY KEY, task_id text NOT NULL, user_id text NOT NULL,
  content text NOT NULL, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.asset (
  id text PRIMARY KEY, organization_id text NOT NULL, board_id text, repo_id text,
  task_id text, activity_id text, object_key text NOT NULL, filename text NOT NULL,
  mime_type text NOT NULL, size integer NOT NULL, kind text NOT NULL DEFAULT 'image',
  surface text NOT NULL DEFAULT 'description', created_by text, created_at timestamp
);
CREATE TABLE legacy.repo (
  id text PRIMARY KEY, organization_id text NOT NULL, provider text NOT NULL,
  owner text NOT NULL, name text NOT NULL, external_id text, url text NOT NULL,
  description text, default_branch text, is_private boolean NOT NULL DEFAULT false,
  config jsonb, is_active boolean NOT NULL DEFAULT true, org_privilege text,
  last_synced_at timestamp, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.repo_issue (
  id text PRIMARY KEY, repo_id text NOT NULL, number integer NOT NULL, external_id text,
  title text NOT NULL, body text, state text NOT NULL, author_login text,
  author_avatar_url text, assignee_logins jsonb, labels jsonb,
  comment_count integer NOT NULL DEFAULT 0, url text NOT NULL,
  external_created_at timestamp, external_updated_at timestamp, closed_at timestamp,
  created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.repo_pull_request (
  id text PRIMARY KEY, repo_id text NOT NULL, number integer NOT NULL, external_id text,
  title text NOT NULL, body text, state text NOT NULL, is_draft boolean NOT NULL DEFAULT false,
  author_login text, author_avatar_url text, head_branch text, base_branch text,
  labels jsonb, comment_count integer NOT NULL DEFAULT 0, additions integer,
  deletions integer, changed_files integer, url text NOT NULL,
  external_created_at timestamp, external_updated_at timestamp, merged_at timestamp,
  closed_at timestamp, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.organization_github_installation (
  id text PRIMARY KEY, organization_id text NOT NULL, installation_id integer NOT NULL,
  account_id integer NOT NULL, account_login text NOT NULL, account_type text NOT NULL,
  account_avatar_url text, repository_selection text, permissions jsonb,
  created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.github_user_grant (
  id text PRIMARY KEY, user_id text NOT NULL, provider_id text NOT NULL,
  github_user_id text NOT NULL, github_login text NOT NULL, access_token text NOT NULL,
  refresh_token text, access_token_expires_at timestamp, refresh_token_expires_at timestamp,
  scope text, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.integration (
  id text PRIMARY KEY, board_id text NOT NULL, type text NOT NULL, config text NOT NULL,
  is_active boolean DEFAULT true, created_at timestamp, updated_at timestamp
);
CREATE TABLE legacy.resource_grant (
  id text PRIMARY KEY, organization_id text NOT NULL, resource_type text NOT NULL,
  resource_id text NOT NULL, user_id text, team_id text, privilege text NOT NULL,
  created_at timestamp, updated_at timestamp
);
`;

// --- destination (Stellarc) schema, in schema `public` ----------------------------
// T0 foundation (event/org_event_counter/sync_probe) is applied via migrate.ts;
// these domain + ledger tables are the reconciliation destination materialized by
// the golden generator per the sibling-spec contracts.
export const DESTINATION_SCHEMA_SQL = `
CREATE TABLE public."user" (
  id text PRIMARY KEY, name text NOT NULL, email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false, image text, locale text,
  created_at timestamp, updated_at timestamp, is_anonymous boolean, role text,
  banned boolean, ban_reason text, ban_expires timestamp
);
CREATE TABLE public.account (
  id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
  user_id text NOT NULL, access_token text, refresh_token text, id_token text,
  access_token_expires_at timestamp, refresh_token_expires_at timestamp,
  scope text, password text, created_at timestamp, updated_at timestamp
);
CREATE TABLE public.organization (
  id text PRIMARY KEY, name text NOT NULL, slug text NOT NULL, logo text,
  metadata text, description text, repos_enabled boolean NOT NULL DEFAULT false,
  tables_enabled boolean NOT NULL DEFAULT false,
  default_resource_privilege text NOT NULL DEFAULT 'manage',
  ai_enabled boolean NOT NULL DEFAULT false, ai_default_token_limit integer NOT NULL DEFAULT 1024,
  ai_default_character_limit integer NOT NULL DEFAULT 4000,
  ai_provider_base_url text, ai_provider_model text, ai_provider_api_key text,
  created_at timestamp
);
CREATE TABLE public.organization_member (
  id text PRIMARY KEY, organization_id text NOT NULL, user_id text NOT NULL,
  role text NOT NULL DEFAULT 'member', ai_token_limit integer,
  ai_character_limit integer, joined_at timestamp
);
CREATE TABLE public.organization_role (
  id text PRIMARY KEY, organization_id text NOT NULL, role text NOT NULL,
  permission text NOT NULL, created_at timestamp, updated_at timestamp
);
CREATE TABLE public.team (
  id text PRIMARY KEY, name text NOT NULL, organization_id text NOT NULL,
  source text NOT NULL DEFAULT 'kaneo', icon text, parent_team_id text,
  created_at timestamp, updated_at timestamp
);
CREATE TABLE public.team_member (
  id text PRIMARY KEY, team_id text NOT NULL, user_id text NOT NULL, created_at timestamp
);
CREATE TABLE public.invitation (
  id text PRIMARY KEY, organization_id text NOT NULL, email text NOT NULL,
  role text, team_id text, status text NOT NULL DEFAULT 'pending',
  expires_at timestamp, created_at timestamp, inviter_id text NOT NULL
);
CREATE TABLE public.user_avatar (
  id text PRIMARY KEY, user_id text NOT NULL, mime_type text NOT NULL,
  size integer NOT NULL, data bytea NOT NULL, created_at timestamp, updated_at timestamp
);
CREATE TABLE public.apikey (
  id text PRIMARY KEY, config_id text NOT NULL DEFAULT 'default', name text,
  start text, reference_id text NOT NULL, prefix text, key text NOT NULL,
  user_id text, refill_interval integer, refill_amount integer,
  last_refill_at timestamp, enabled boolean DEFAULT true,
  rate_limit_enabled boolean DEFAULT true, rate_limit_time_window integer DEFAULT 86400000,
  rate_limit_max integer DEFAULT 10, request_count integer DEFAULT 0, remaining integer,
  last_request timestamp, expires_at timestamp, created_at timestamp, updated_at timestamp,
  permissions text, metadata text
);
CREATE TABLE public.principal (
  id text PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('human','agent')),
  user_id text, apikey_id text
);
CREATE TABLE public.identity_grant (
  org_id text NOT NULL, principal_id text NOT NULL, capability text NOT NULL,
  PRIMARY KEY (org_id, principal_id, capability)
);
CREATE TABLE public.identity_import (
  source_id text NOT NULL, table_name text NOT NULL, source_pk text NOT NULL,
  digest text NOT NULL, PRIMARY KEY (source_id, table_name, source_pk)
);
CREATE TABLE public.board (
  id text PRIMARY KEY, organization_id text NOT NULL, slug text NOT NULL,
  icon text DEFAULT 'Layout', name text NOT NULL, description text,
  created_at timestamp, is_public boolean DEFAULT false, archived_at timestamp,
  last_task_number integer NOT NULL DEFAULT 0, org_privilege text,
  task_status_order jsonb NOT NULL DEFAULT '["to-do","in-progress","in-review","done","canceled","duplicate"]',
  backlog_status_order jsonb NOT NULL DEFAULT '["triage","planned"]',
  subtask_depth_limit integer NOT NULL DEFAULT 4,
  default_assignee_id text, default_assignee_team_id text
);
CREATE TABLE public.board_key_alias (
  id text PRIMARY KEY, organization_id text NOT NULL, board_id text NOT NULL,
  key text NOT NULL, created_at timestamp
);
CREATE TABLE public.status (
  id text PRIMARY KEY, board_id text NOT NULL, name text NOT NULL, slug text NOT NULL,
  position integer NOT NULL DEFAULT 0, icon text, color text,
  is_final boolean NOT NULL DEFAULT false, created_at timestamp, updated_at timestamp
);
CREATE TABLE public.ticket (
  id text PRIMARY KEY, board_id text NOT NULL, position integer, number integer DEFAULT 1,
  assignee_id text, team_assignee_id text, title text NOT NULL, description text,
  description_history jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'to-do',
  column_id text, priority text DEFAULT 'low', milestone_id text,
  archived_at timestamp, archived_by text, deleted_at timestamp, deleted_by text,
  start_date timestamp, due_date timestamp, created_at timestamp, updated_at timestamp,
  key text NOT NULL
);
CREATE TABLE public.entity_link (
  id text PRIMARY KEY, kind text NOT NULL, source_task_id text, target_task_id text,
  target_user_id text, relation_type text, external_id text, url text, title text,
  repo_issue_id text, repo_pull_request_id text, sync_enabled boolean, created_at timestamp
);
CREATE TABLE public.milestone (
  id text PRIMARY KEY, board_id text NOT NULL, name text NOT NULL, description text,
  due_date timestamp, status text NOT NULL DEFAULT 'planned', position integer NOT NULL DEFAULT 0,
  completed_at timestamp, created_at timestamp, updated_at timestamp
);
CREATE TABLE public.comment (
  id text PRIMARY KEY, org_id text, ticket_id text, type text NOT NULL DEFAULT 'comment',
  created_at timestamp, updated_at timestamp, user_id text, content text,
  edit_history jsonb NOT NULL DEFAULT '[]', event_data jsonb,
  external_user_name text, external_user_avatar text, external_source text, external_url text
);
CREATE TABLE public.activity_import (
  source_id text NOT NULL, table_name text NOT NULL, source_pk text NOT NULL,
  digest text NOT NULL, destination_id text, destination_org text, destination_seq bigint,
  PRIMARY KEY (source_id, table_name, source_pk)
);
CREATE TABLE public.asset (
  id text PRIMARY KEY, organization_id text NOT NULL, board_id text, repo_id text,
  task_id text, activity_id text, object_key text NOT NULL, filename text NOT NULL,
  mime_type text NOT NULL, size integer NOT NULL, kind text NOT NULL DEFAULT 'image',
  surface text NOT NULL DEFAULT 'description', created_by text, created_at timestamp
);
CREATE TABLE public.repo (
  id text PRIMARY KEY, organization_id text NOT NULL, provider text NOT NULL,
  owner text NOT NULL, name text NOT NULL, external_id text, url text NOT NULL,
  description text, default_branch text, is_private boolean NOT NULL DEFAULT false,
  config jsonb, is_active boolean NOT NULL DEFAULT true, org_privilege text,
  last_synced_at timestamp, created_at timestamp, updated_at timestamp
);
CREATE TABLE public.repo_issue (
  id text PRIMARY KEY, repo_id text NOT NULL, number integer NOT NULL, external_id text,
  title text NOT NULL, body text, state text NOT NULL, author_login text,
  author_avatar_url text, assignee_logins jsonb, labels jsonb,
  comment_count integer NOT NULL DEFAULT 0, url text NOT NULL,
  external_created_at timestamp, external_updated_at timestamp, closed_at timestamp,
  created_at timestamp, updated_at timestamp
);
CREATE TABLE public.repo_pull_request (
  id text PRIMARY KEY, repo_id text NOT NULL, number integer NOT NULL, external_id text,
  title text NOT NULL, body text, state text NOT NULL, is_draft boolean NOT NULL DEFAULT false,
  author_login text, author_avatar_url text, head_branch text, base_branch text,
  labels jsonb, comment_count integer NOT NULL DEFAULT 0, additions integer,
  deletions integer, changed_files integer, url text NOT NULL,
  external_created_at timestamp, external_updated_at timestamp, merged_at timestamp,
  closed_at timestamp, created_at timestamp, updated_at timestamp
);
CREATE TABLE public.organization_github_installation (
  id text PRIMARY KEY, organization_id text NOT NULL, installation_id integer NOT NULL,
  account_id integer NOT NULL, account_login text NOT NULL, account_type text NOT NULL,
  account_avatar_url text, repository_selection text, permissions jsonb,
  created_at timestamp, updated_at timestamp
);
CREATE TABLE public.github_user_grant (
  id text PRIMARY KEY, user_id text NOT NULL, provider_id text NOT NULL,
  github_user_id text NOT NULL, github_login text NOT NULL, access_token text NOT NULL,
  refresh_token text, access_token_expires_at timestamp, refresh_token_expires_at timestamp,
  scope text, created_at timestamp, updated_at timestamp
);
CREATE TABLE public.integration (
  id text PRIMARY KEY, board_id text NOT NULL, type text NOT NULL, config text NOT NULL,
  is_active boolean DEFAULT true, created_at timestamp, updated_at timestamp
);
CREATE TABLE public.resource_grant (
  id text PRIMARY KEY, organization_id text NOT NULL, resource_type text NOT NULL,
  resource_id text NOT NULL, user_id text, team_id text, privilege text NOT NULL,
  created_at timestamp, updated_at timestamp
);
`;

// --- seed data. Identity/board/repo/asset/relation PKs and values are preserved
// verbatim between legacy and destination (STL-15 "preserve source identifiers");
// task maps to ticket with a PREFIX-seq key; the four link tables unify into
// entity_link; activity maps to comment/event via activity_import.
export function legacySeedSql(): string {
	return `
INSERT INTO legacy."user" (id, name, email, email_verified, role) VALUES
  ('u1','Alice','a@x.com',true,'admin'),
  ('u2','Bob','b@x.com',true,'admin');
INSERT INTO legacy.account (id, account_id, provider_id, user_id, password) VALUES
  ('a1','cred-1','credential','u1','bcrypt-hash-1');
INSERT INTO legacy.organization (id, name, slug) VALUES
  ('o1','Org A','org-a'), ('o2','Org B','org-b');
INSERT INTO legacy.organization_member (id, organization_id, user_id, role) VALUES
  ('m1','o1','u1','owner'), ('m2','o2','u2','owner');
INSERT INTO legacy.organization_role (id, organization_id, role, permission) VALUES
  ('r1','o1','owner','{}');
INSERT INTO legacy.team (id, name, organization_id) VALUES
  ('t1','Team A','o1'), ('t2','Team B','o2');
INSERT INTO legacy.team_member (id, team_id, user_id) VALUES
  ('tm1','t1','u1'), ('tm2','t2','u2');
INSERT INTO legacy.invitation (id, organization_id, email, status, inviter_id) VALUES
  ('inv1','o1','c@x.com','pending','u1');
INSERT INTO legacy.user_avatar (id, user_id, mime_type, size, data) VALUES
  ('av1','u1','image/png',4,decode('89504e47','hex'));
INSERT INTO legacy.apikey (id, name, reference_id, prefix, key, enabled, rate_limit_enabled, permissions) VALUES
  ('k1','key-1','u1','sk-a','${hashApiKey(KNOWN_ANSWER_RAWS[0])}',true,true,'{"*":["*"]}'),
  ('k2','key-2','u2','sk-b','${hashApiKey(KNOWN_ANSWER_RAWS[1])}',true,true,'{"*":["*"]}');
INSERT INTO legacy.board (id, organization_id, slug, name, last_task_number) VALUES
  ('b1','o1','eng','Engineering',2), ('b2','o2','ops','Operations',1);
INSERT INTO legacy.board_key_alias (id, organization_id, board_id, key) VALUES
  ('bka1','o1','b1','ENG'), ('bka2','o2','b2','OPS');
INSERT INTO legacy.column (id, board_id, name, slug) VALUES
  ('c1','b1','To Do','to-do'), ('c2','b2','To Do','to-do');
INSERT INTO legacy.task (id, board_id, number, title, status, column_id, description_history) VALUES
  ('task1','b1',1,'First task','to-do','c1','[{"content":"v1","editedAt":"2026-01-01T00:00:00Z","userId":"u1"}]'),
  ('task2','b1',2,'Second task','to-do','c1','[]'),
  ('task3','b2',1,'Ops task','to-do','c2','[]');
INSERT INTO legacy.task_relation (id, source_task_id, target_task_id, relation_type) VALUES
  ('tr1','task1','task2','blocks');
INSERT INTO legacy.task_follower (id, task_id, user_id) VALUES ('tf1','task1','u1');
INSERT INTO legacy.external_link (id, task_id, resource_type, external_id, url) VALUES
  ('el1','task1','github','123','https://github.com/x/y');
INSERT INTO legacy.task_repo_item_link (id, task_id, repo_issue_id, sync_enabled) VALUES
  ('tril1','task1','issue1',false);
INSERT INTO legacy.milestone (id, board_id, name) VALUES ('ms1','b1','M1');
INSERT INTO legacy.activity (id, task_id, type, content, user_id) VALUES
  ('act1','task1','comment','hello','u1'),
  ('act2','task1','status-changed',NULL,'u1');
INSERT INTO legacy.comment (id, task_id, user_id, content) VALUES
  ('com1','task1','u1','a comment');
INSERT INTO legacy.asset (id, organization_id, board_id, object_key, filename, mime_type, size) VALUES
  ('asset1','o1','b1','o1/asset1.png','asset1.png','image/png',4);
INSERT INTO legacy.repo (id, organization_id, provider, owner, name, url) VALUES
  ('repo1','o1','github','acme','repo1','https://github.com/acme/repo1');
INSERT INTO legacy.repo_issue (id, repo_id, number, title, state, url) VALUES
  ('issue1','repo1',1,'Issue one','open','https://github.com/acme/repo1/issues/1');
INSERT INTO legacy.repo_pull_request (id, repo_id, number, title, state, url) VALUES
  ('pr1','repo1',1,'PR one','open','https://github.com/acme/repo1/pull/1');
INSERT INTO legacy.organization_github_installation (id, organization_id, installation_id, account_id, account_login, account_type) VALUES
  ('install1','o1',42,42,'acme','Organization');
INSERT INTO legacy.github_user_grant (id, user_id, provider_id, github_user_id, github_login, access_token) VALUES
  ('ghgrant1','u1','github','100','alice','gh-token');
INSERT INTO legacy.integration (id, board_id, type, config) VALUES
  ('integ1','b1','github','{}');
INSERT INTO legacy.resource_grant (id, organization_id, resource_type, resource_id, user_id, privilege) VALUES
  ('rg1','o1','board','b1','u1','edit');
`;
}

export function destinationSeedSql(): string {
	return `
INSERT INTO public."user" (id, name, email, email_verified, role) VALUES
  ('u1','Alice','a@x.com',true,'admin'),
  ('u2','Bob','b@x.com',true,'admin');
INSERT INTO public.account (id, account_id, provider_id, user_id, password) VALUES
  ('a1','cred-1','credential','u1','bcrypt-hash-1');
INSERT INTO public.organization (id, name, slug) VALUES
  ('o1','Org A','org-a'), ('o2','Org B','org-b');
INSERT INTO public.organization_member (id, organization_id, user_id, role) VALUES
  ('m1','o1','u1','owner'), ('m2','o2','u2','owner');
INSERT INTO public.organization_role (id, organization_id, role, permission) VALUES
  ('r1','o1','owner','{}');
INSERT INTO public.team (id, name, organization_id) VALUES
  ('t1','Team A','o1'), ('t2','Team B','o2');
INSERT INTO public.team_member (id, team_id, user_id) VALUES
  ('tm1','t1','u1'), ('tm2','t2','u2');
INSERT INTO public.invitation (id, organization_id, email, status, inviter_id) VALUES
  ('inv1','o1','c@x.com','pending','u1');
INSERT INTO public.user_avatar (id, user_id, mime_type, size, data) VALUES
  ('av1','u1','image/png',4,decode('89504e47','hex'));
INSERT INTO public.apikey (id, name, reference_id, prefix, key, enabled, rate_limit_enabled, permissions) VALUES
  ('k1','key-1','u1','sk-a','${hashApiKey(KNOWN_ANSWER_RAWS[0])}',true,true,'{"*":["*"]}'),
  ('k2','key-2','u2','sk-b','${hashApiKey(KNOWN_ANSWER_RAWS[1])}',true,true,'{"*":["*"]}');
INSERT INTO public.principal (id, kind, user_id, apikey_id) VALUES
  ('p1','human','u1',NULL), ('p2','agent',NULL,'k1');
INSERT INTO public.identity_grant (org_id, principal_id, capability) VALUES
  ('o1','p1','manage');
INSERT INTO public.identity_import (source_id, table_name, source_pk, digest) VALUES
  ('run-1','user','u1','d1'), ('run-1','user','u2','d2'),
  ('run-1','account','a1','d3'),
  ('run-1','organization','o1','d4'), ('run-1','organization','o2','d5'),
  ('run-1','organization_member','m1','d6'), ('run-1','organization_member','m2','d7'),
  ('run-1','organization_role','r1','d8');
INSERT INTO public.board (id, organization_id, slug, name, last_task_number) VALUES
  ('b1','o1','eng','Engineering',2), ('b2','o2','ops','Operations',1);
INSERT INTO public.board_key_alias (id, organization_id, board_id, key) VALUES
  ('bka1','o1','b1','ENG'), ('bka2','o2','b2','OPS');
INSERT INTO public.status (id, board_id, name, slug) VALUES
  ('c1','b1','To Do','to-do'), ('c2','b2','To Do','to-do');
INSERT INTO public.ticket (id, board_id, number, title, status, column_id, description_history, key) VALUES
  ('task1','b1',1,'First task','to-do','c1','[{"content":"v1","editedAt":"2026-01-01T00:00:00Z","userId":"u1"}]','ENG-1'),
  ('task2','b1',2,'Second task','to-do','c1','[]','ENG-2'),
  ('task3','b2',1,'Ops task','to-do','c2','[]','OPS-1');
INSERT INTO public.entity_link (id, kind, source_task_id, target_task_id, target_user_id, relation_type, external_id, url, repo_issue_id, repo_pull_request_id, sync_enabled) VALUES
  ('el-rel-1','relation','task1','task2',NULL,'blocks',NULL,NULL,NULL,NULL,NULL),
  ('el-fol-1','follower','task1',NULL,'u1',NULL,NULL,NULL,NULL,NULL,NULL),
  ('el-ext-1','external','task1',NULL,NULL,'github','123','https://github.com/x/y',NULL,NULL,NULL),
  ('el-repo-1','repo_item','task1',NULL,NULL,NULL,NULL,NULL,'issue1',NULL,false);
INSERT INTO public.milestone (id, board_id, name) VALUES ('ms1','b1','M1');
INSERT INTO public.comment (id, org_id, ticket_id, type, content, user_id) VALUES
  ('dest-com1','o1','task1','comment','hello','u1'),
  ('dest-com2','o1','task1','comment','a comment','u1');
INSERT INTO public.activity_import (source_id, table_name, source_pk, digest, destination_id, destination_org, destination_seq) VALUES
  ('run-1','activity','act1','da1','dest-com1',NULL,NULL),
  ('run-1','comment','com1','da2','dest-com2',NULL,NULL),
  ('run-1','activity','act2','da3',NULL,'o1',1);
INSERT INTO public.asset (id, organization_id, board_id, object_key, filename, mime_type, size) VALUES
  ('asset1','o1','b1','o1/asset1.png','asset1.png','image/png',4);
INSERT INTO public.repo (id, organization_id, provider, owner, name, url) VALUES
  ('repo1','o1','github','acme','repo1','https://github.com/acme/repo1');
INSERT INTO public.repo_issue (id, repo_id, number, title, state, url) VALUES
  ('issue1','repo1',1,'Issue one','open','https://github.com/acme/repo1/issues/1');
INSERT INTO public.repo_pull_request (id, repo_id, number, title, state, url) VALUES
  ('pr1','repo1',1,'PR one','open','https://github.com/acme/repo1/pull/1');
INSERT INTO public.organization_github_installation (id, organization_id, installation_id, account_id, account_login, account_type) VALUES
  ('install1','o1',42,42,'acme','Organization');
INSERT INTO public.github_user_grant (id, user_id, provider_id, github_user_id, github_login, access_token) VALUES
  ('ghgrant1','u1','github','100','alice','gh-token');
INSERT INTO public.integration (id, board_id, type, config) VALUES
  ('integ1','b1','github','{}');
INSERT INTO public.resource_grant (id, organization_id, resource_type, resource_id, user_id, privilege) VALUES
  ('rg1','o1','board','b1','u1','edit');
-- org_event_counter rows for the two orgs (event log appends need them)
INSERT INTO public.org_event_counter (org, seq) VALUES ('o1', 1), ('o2', 0);
-- the imported domain event for activity 'act2' (status-changed), seq 1 on o1
INSERT INTO public.event (org, seq, plugin_type, actor, payload, schema_version, txid) VALUES
  ('o1', 1, 'activity:status-changed', 'u1', '{"id":"act2"}', 1, 1);
`;
}

// --- corpus loader / validator ----------------------------------------------------
export interface ManifestQuery {
	id: number;
	file: string;
	owner: string;
	semantics_source: string;
	preconditions: string[];
	sabotages: string[];
}

export interface Manifest {
	canon_count: number;
	sabotage_count: number;
	queries: ManifestQuery[];
	known_answers: {
		apikey_sha256_base64url: Array<{ raw: string; reference_id: string }>;
	};
}

const REPO_ROOT = join(import.meta.dirname, "..", "..");

export function repoRoot(): string {
	return REPO_ROOT;
}

export function queriesDir(): string {
	return join(REPO_ROOT, "docs", "legacy", "reconciliation", "queries");
}

export function sabotageDir(): string {
	return join(REPO_ROOT, "tests", "fixtures", "reconciliation", "sabotage");
}

export function manifestPath(): string {
	return join(
		REPO_ROOT,
		"tests",
		"fixtures",
		"reconciliation",
		"manifest.json",
	);
}

export async function loadManifest(): Promise<Manifest> {
	const raw = await readFile(manifestPath(), "utf8");
	return JSON.parse(raw) as Manifest;
}

export async function loadQueryText(file: string): Promise<string> {
	return readFile(join(REPO_ROOT, file), "utf8");
}

export async function loadSabotageText(file: string): Promise<string> {
	return readFile(join(REPO_ROOT, file), "utf8");
}

export interface CorpusValidation {
	ok: boolean;
	errors: string[];
	queryIds: number[];
	sabotageCount: number;
}

/** R01: exactly 14 query files, unique ids, complete headers, 16 sabotage files. */
export async function validateCorpus(
	manifest: Manifest,
): Promise<CorpusValidation> {
	const errors: string[] = [];
	const queryIds: number[] = [];
	const queryFiles = (await readdir(queriesDir())).filter((f) =>
		f.endsWith(".sql"),
	);
	const sabotageFiles = (await readdir(sabotageDir())).filter((f) =>
		f.endsWith(".sql"),
	);

	if (queryFiles.length !== manifest.canon_count)
		errors.push(
			`query file count ${queryFiles.length} != canon_count ${manifest.canon_count}`,
		);
	if (sabotageFiles.length !== manifest.sabotage_count)
		errors.push(
			`sabotage file count ${sabotageFiles.length} != sabotage_count ${manifest.sabotage_count}`,
		);

	const seen = new Set<number>();
	for (const q of manifest.queries) {
		if (seen.has(q.id)) errors.push(`duplicate query id ${q.id}`);
		seen.add(q.id);
		queryIds.push(q.id);
		const text = await loadQueryText(q.file).catch(() => "");
		for (const required of [
			"Owner:",
			"Semantics source:",
			"Precondition tables:",
			"Blocked if:",
		])
			if (!text.includes(required))
				errors.push(`query ${q.id} header missing "${required}"`);
		for (const sab of q.sabotages) {
			const stext = await loadSabotageText(sab).catch(() => "");
			if (!stext.includes("-- Sabotage"))
				errors.push(`sabotage ${sab} missing header`);
		}
	}

	if (queryIds.length !== manifest.canon_count)
		errors.push(
			`manifest query count ${queryIds.length} != canon_count ${manifest.canon_count}`,
		);
	if (!queryIds.every((id, i) => id === i + 1))
		errors.push(`query ids not contiguous 1..${manifest.canon_count}`);

	return {
		ok: errors.length === 0,
		errors,
		queryIds,
		sabotageCount: sabotageFiles.length,
	};
}
