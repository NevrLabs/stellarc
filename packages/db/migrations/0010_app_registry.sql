-- App registry (ADR 0015 §6, sequence step 1). `app` is what is installed on
-- this plane: one row per manifest, written at boot from the first-party list
-- (charter D8: install is plane-wide). `app_activation` is which orgs switched
-- an app on and the capabilities each org ratified for it (D3); the read side
-- never returns more than the manifest currently asks for. Every change is
-- also appended to the org log as apps:activated / apps:deactivated (D10, D12).
-- `org` is the org key, organization.id (ADR 0015, "One org identity"). Like
-- event.org it is not a foreign key until identity writes organization rows.
CREATE TABLE app (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{0,62}$'),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_activation (
  org text NOT NULL CHECK (length(org) > 0),
  app_id text NOT NULL REFERENCES app(id),
  capabilities jsonb NOT NULL CHECK (jsonb_typeof(capabilities) = 'array'),
  activated_by text NOT NULL CHECK (length(activated_by) > 0),
  activated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org, app_id)
);
