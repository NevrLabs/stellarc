-- STL-18 §2: repository resource, GitHub authorization and board-owned
-- integration connection. snake_case storage with the source's exact
-- nullability. `integration.board_id` has no FK yet: the `board` table is
-- STL-16's; the composite unique (board_id,type) is declared here so the
-- integration contract exists before boards land (question Q3).

CREATE TABLE repo (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  provider text NOT NULL,
  owner text NOT NULL,
  name text NOT NULL,
  external_id text,
  url text NOT NULL,
  description text,
  default_branch text,
  is_private boolean NOT NULL DEFAULT false,
  config jsonb,
  is_active boolean NOT NULL DEFAULT true,
  org_privilege text,
  last_synced_at timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT repo_org_provider_owner_name_key UNIQUE (organization_id, provider, owner, name)
);

CREATE TABLE repo_issue (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repo (id) ON DELETE CASCADE,
  number integer NOT NULL,
  external_id text,
  title text NOT NULL,
  body text,
  state text NOT NULL,
  author_login text,
  author_avatar_url text,
  assignee_logins jsonb,
  labels jsonb,
  comment_count integer NOT NULL DEFAULT 0,
  url text NOT NULL,
  external_created_at timestamp without time zone,
  external_updated_at timestamp without time zone,
  closed_at timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT repo_issue_repo_number_key UNIQUE (repo_id, number)
);
CREATE INDEX repo_issue_repo_id_idx ON repo_issue (repo_id);

CREATE TABLE repo_pull_request (
  id text PRIMARY KEY,
  repo_id text NOT NULL REFERENCES repo (id) ON DELETE CASCADE,
  number integer NOT NULL,
  external_id text,
  title text NOT NULL,
  body text,
  state text NOT NULL,
  is_draft boolean NOT NULL DEFAULT false,
  author_login text,
  author_avatar_url text,
  head_branch text,
  base_branch text,
  labels jsonb,
  comment_count integer NOT NULL DEFAULT 0,
  additions integer,
  deletions integer,
  changed_files integer,
  url text NOT NULL,
  external_created_at timestamp without time zone,
  external_updated_at timestamp without time zone,
  merged_at timestamp without time zone,
  closed_at timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT repo_pull_request_repo_number_key UNIQUE (repo_id, number)
);
CREATE INDEX repo_pull_request_repo_id_idx ON repo_pull_request (repo_id);

CREATE TABLE organization_github_installation (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  installation_id integer NOT NULL,
  account_id integer NOT NULL,
  account_login text NOT NULL,
  account_type text NOT NULL,
  account_avatar_url text,
  repository_selection text,
  permissions jsonb,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT organization_github_installation_org_installation_key UNIQUE (organization_id, installation_id)
);

-- github_user_grant: access_token/refresh_token are stored as imported,
-- unchanged (fork stores plaintext today). -- SECRET: encryption pending STL-xx
CREATE TABLE github_user_grant (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  github_user_id text NOT NULL,
  github_login text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  access_token_expires_at timestamp without time zone,
  refresh_token_expires_at timestamp without time zone,
  scope text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT github_user_grant_user_provider_key UNIQUE (user_id, provider_id)
);

-- integration.config may embed provider secrets; stored as imported.
-- -- SECRET: encryption pending STL-xx
CREATE TABLE integration (
  id text PRIMARY KEY,
  board_id text NOT NULL,
  type text NOT NULL,
  config text NOT NULL,
  is_active boolean,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT integration_board_type_key UNIQUE (board_id, type)
);
